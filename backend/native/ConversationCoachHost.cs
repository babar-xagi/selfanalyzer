using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;

// Chrome owns this process while its native messaging port is connected.
// Only the API process started by this host is stopped when the port closes.
internal sealed class ConversationCoachHost : IDisposable
{
    private readonly Stream input = Console.OpenStandardInput();
    private readonly Stream output = Console.OpenStandardOutput();
    private readonly string backend;
    private readonly string port;
    private readonly StreamWriter log;
    private Process server;

    [DataContract]
    private sealed class Request
    {
        [DataMember(Name = "type")]
        public string Type;
    }

    [DataContract]
    private sealed class Reply
    {
        [DataMember(Name = "ok")]
        public bool Ok;
        [DataMember(Name = "status")]
        public string Status;
        [DataMember(Name = "error")]
        public string Error;
    }

    private ConversationCoachHost()
    {
        backend = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", ".."));
        port = Environment.GetEnvironmentVariable("CONVERSATION_COACH_API_PORT") ?? "8000";
        Directory.CreateDirectory(Path.Combine(backend, "data"));
        log = new StreamWriter(Path.Combine(backend, "data", "native-host.log"), true, new UTF8Encoding(false));
        log.AutoFlush = true;
    }

    private void Log(string message)
    {
        lock (log)
        {
            try { log.WriteLine(DateTime.UtcNow.ToString("o") + " " + message); }
            catch (ObjectDisposedException) { }
        }
    }

    private static byte[] ReadBytes(Stream stream, int length)
    {
        byte[] bytes = new byte[length];
        int read = 0;
        while (read < length)
        {
            int count = stream.Read(bytes, read, length - read);
            if (count == 0)
            {
                if (read == 0) return null;
                throw new EndOfStreamException();
            }
            read += count;
        }
        return bytes;
    }

    private Request ReadRequest()
    {
        byte[] header = ReadBytes(input, 4);
        if (header == null) return null;
        int length = BitConverter.ToInt32(header, 0);
        if (length < 1 || length > 65536) throw new InvalidDataException("Invalid native message length.");
        byte[] body = ReadBytes(input, length);
        if (body == null) throw new EndOfStreamException();
        using (var memory = new MemoryStream(body))
        {
            var serializer = new DataContractJsonSerializer(typeof(Request));
            return (Request)serializer.ReadObject(memory);
        }
    }

    private void Send(bool ok, string status, string error)
    {
        var serializer = new DataContractJsonSerializer(typeof(Reply));
        using (var memory = new MemoryStream())
        {
            serializer.WriteObject(memory, new Reply { Ok = ok, Status = status, Error = error });
            byte[] body = memory.ToArray();
            byte[] length = BitConverter.GetBytes(body.Length);
            output.Write(length, 0, length.Length);
            output.Write(body, 0, body.Length);
            output.Flush();
        }
    }

    private bool Healthy()
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/health");
            request.Timeout = 800;
            request.Proxy = null;
            using (var response = (HttpWebResponse)request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream()))
                return response.StatusCode == HttpStatusCode.OK && reader.ReadToEnd().Contains("\"status\":\"ok\"");
        }
        catch (WebException) { return false; }
        catch (IOException) { return false; }
    }

    private bool StartServer(out string error)
    {
        error = null;
        if (Healthy()) return true;
        string python = Path.Combine(backend, ".venv", "Scripts", "python.exe");
        string entrypoint = Path.Combine(backend, "scripts", "serve_for_extension.py");
        if (!File.Exists(python) || !File.Exists(entrypoint))
        {
            error = "Local Python backend is missing. Install the companion from this project first.";
            return false;
        }
        try
        {
            if (server != null) { server.Dispose(); server = null; }
            var info = new ProcessStartInfo(python, "-u \"" + entrypoint + "\"");
            info.WorkingDirectory = backend;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.EnvironmentVariables["CONVERSATION_COACH_OWNER_PID"] = Process.GetCurrentProcess().Id.ToString();
            info.EnvironmentVariables["CONVERSATION_COACH_API_PORT"] = port;
            server = new Process();
            server.StartInfo = info;
            server.OutputDataReceived += (sender, args) => { if (args.Data != null) Log(args.Data); };
            server.ErrorDataReceived += (sender, args) => { if (args.Data != null) Log(args.Data); };
            server.Start();
            server.BeginOutputReadLine();
            server.BeginErrorReadLine();
            for (int attempt = 0; attempt < 50; attempt++)
            {
                if (Healthy()) return true;
                if (server.HasExited) break;
                Thread.Sleep(200);
            }
            error = "Local transcript server did not start. Check backend/data/native-host.log.";
            StopServer();
            return false;
        }
        catch (Exception exception)
        {
            Log(exception.ToString());
            error = "Local transcript server could not start. Check backend/data/native-host.log.";
            StopServer();
            return false;
        }
    }

    private void StopServer()
    {
        if (server == null) return;
        try
        {
            if (!server.HasExited)
            {
                var info = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "taskkill.exe"),
                    "/PID " + server.Id + " /T /F");
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                using (Process killer = Process.Start(info)) killer.WaitForExit(5000);
            }
        }
        catch (Exception exception) { Log("Server stop: " + exception.Message); }
        finally { server.Dispose(); server = null; }
    }

    private void Run()
    {
        while (true)
        {
            Request request = ReadRequest();
            if (request == null) break;
            if (request.Type == "start")
            {
                string error;
                bool ready = StartServer(out error);
                Send(ready, ready ? "ready" : "failed", error);
            }
            else if (request.Type == "stop")
            {
                StopServer();
                Send(true, "stopped", null);
                break;
            }
            else Send(false, "failed", "Unknown companion command.");
        }
    }

    public void Dispose()
    {
        StopServer();
        log.Dispose();
    }

    private static int Main()
    {
        try
        {
            using (var host = new ConversationCoachHost()) host.Run();
            return 0;
        }
        catch (Exception) { return 1; }
    }
}
