using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Text;
using System.Windows.Forms;

namespace Convert2GIF
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }

    sealed class MainForm : Form
    {
        const string HostExe = "c2g-host.exe";
        const string AppName = "Convert2GIF Bootstrapper";
        static readonly Color Teal = Color.FromArgb(20, 184, 166);
        static readonly Color Coal = Color.FromArgb(11, 15, 20);
        static readonly Color Panel = Color.FromArgb(24, 29, 36);
        static readonly Color Muted = Color.FromArgb(135, 141, 150);
        static readonly Color Good = Color.FromArgb(45, 212, 130);
        static readonly Color BadDanger = Color.FromArgb(245, 101, 101);

        readonly string UserData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Convert2GIF");
        readonly string hostPath;
        readonly string exeDir;

        TextBox txtToken, txtClient, txtLog;
        Button btnSave, btnStart, btnStop, btnCheck, btnUpdate, btnRepair, btnData, btnQuit;
        Label lblStatus, lblVer, lblHost, lblUsage;
        RadioButton rOnline, rIdle, rDnd, rInvis;
        System.Windows.Forms.Timer pollTimer;
        System.Windows.Forms.Timer discoveryTimer;
        NotifyIcon tray;
        ContextMenu trayMenu;
        System.Diagnostics.Process hostProc;
        string baseUrl = "", token = "";
        bool foundOnce, closing, showBalloon;
        string lastLog = "";

        public MainForm()
        {
            exeDir = Path.GetDirectoryName(Application.ExecutablePath);
            hostPath = Path.Combine(exeDir, HostExe);
            BuildUI();
            pollTimer = new System.Windows.Forms.Timer { Interval = 1200 };
            pollTimer.Tick += (s, e) => Poll();
            Shown += (s, e) => EnsureHost();
            pollTimer.Start();
        }

        void BuildUI()
        {
            Text = Name;
            Font = new Font("Segoe UI", 9);
            BackColor = Coal;
            ForeColor = Color.FromArgb(226, 230, 235);
            ClientSize = new Size(580, 505);
            MinimumSize = new Size(580, 505);
            StartPosition = FormStartPosition.CenterScreen;

            // header
            var header = new Panel { Dock = DockStyle.Top, Height = 54, BackColor = Panel };
            var title = new Label { Text = "Convert2GIF", Left = 16, Top = 7, Width = 200, Height = 24, Font = new Font("Segoe UI", 13, FontStyle.Bold), ForeColor = Teal, BackColor = Color.Transparent };
            lblVer = new Label { Text = "v\u2014  |  hosting bot for your Discord", Left = 16, Top = 32, Width = 340, Height = 16, Font = new Font("Segoe UI", 8.5f), ForeColor = Muted, BackColor = Color.Transparent };
            lblHost = new Label { Text = "\u25CF connecting...", Left = 384, Top = 17, Width = 184, Height = 18, Font = new Font("Segoe UI", 9, FontStyle.Bold), TextAlign = ContentAlignment.MiddleRight, ForeColor = Muted, BackColor = Color.Transparent };
            header.Controls.Add(title); header.Controls.Add(lblVer); header.Controls.Add(lblHost);
            Controls.Add(header);

            int x = 16, w = 548;
            int y = 68;

            // config section
            var cap = SectionLabel("BOT CONFIG", x, ref y);
            Controls.Add(cap);

            Label lTok, lCid;
            TextBox tTok, tCid;
            AddField(x, ref y, out lTok, out tTok, "Bot Token", 548);
            txtToken = tTok;
            y += 34;
            AddField(x, ref y, out lCid, out tCid, "Client ID", 300);
            txtClient = tCid;
            btnSave = FlatBtn("Save Config", 326, y + 24, 120);
            btnSave.Click += (s, e) => SaveConfig();
            Controls.Add(btnSave);

            y += 30;
            lblUsage = new Label
            {
                Text = "Get your token + client id from the Discord Developer Portal, then press Save.",
                Left = x, Top = y + 14, Width = w, Height = 16,
                Font = new Font("Segoe UI", 8.5f), ForeColor = Muted, BackColor = Color.Transparent
            };
            Controls.Add(lblUsage);
            y += 38;

            // status + presence
            var cap2 = SectionLabel("CONTROL", x, ref y);
            Controls.Add(cap2);

            lblStatus = new Label { Text = "\u25CF OFFLINE", Left = x, Top = y + 14, Width = 130, Height = 22, Font = new Font("Segoe UI", 11, FontStyle.Bold), ForeColor = Muted, BackColor = Color.Transparent };
            Controls.Add(lblStatus);
            new Label { Text = "Presence:", Left = x + 150, Top = y + 18, Width = 62, Height = 16, Font = new Font("Segoe UI", 8.5f), ForeColor = Muted, BackColor = Color.Transparent }.Also(Controls.Add);
            y += 42;

            rOnline = new RadioButton { Text = "Online", Left = x + 150, Top = y + 2, Checked = true, ForeColor = Color.FromArgb(226, 230, 235), BackColor = Color.Transparent };
            rIdle = new RadioButton { Text = "Idle", Left = x + 220, Top = y + 2, ForeColor = Color.FromArgb(226, 230, 235), BackColor = Color.Transparent };
            rDnd = new RadioButton { Text = "Do Not Disturb", Left = x + 275, Top = y + 2, ForeColor = Color.FromArgb(226, 230, 235), BackColor = Color.Transparent };
            rInvis = new RadioButton { Text = "Invisible", Left = x + 395, Top = y + 2, ForeColor = Color.FromArgb(226, 230, 235), BackColor = Color.Transparent };
            foreach (var rb in new[] { rOnline, rIdle, rDnd, rInvis })
            {
                rb.CheckedChanged += (s, e) => { var c = (RadioButton)s; if (c.Checked) SendPresence(c.Tag.ToString()); };
                Controls.Add(rb);
            }
            rOnline.Tag = "online"; rIdle.Tag = "idle"; rDnd.Tag = "dnd"; rInvis.Tag = "invisible";

            y += 42;

            btnStart = FlatBtn("Start Bot", x, y + 2, 108, Teal);
            btnStop = FlatBtn("Stop Bot", x + 114, y + 2, 108);
            btnCheck = FlatBtn("Check Update", x + 228, y + 2, 112);
            btnUpdate = FlatBtn("Install Update", x + 346, y + 2, 120);
            btnStart.Click += (s, e) => Action("start");
            btnStop.Click += (s, e) => Action("stop");
            btnCheck.Click += (s, e) => Action("checkUpdates");
            btnUpdate.Click += (s, e) => Action("applyUpdate");
            Controls.Add(btnStart); Controls.Add(btnStop); Controls.Add(btnCheck); Controls.Add(btnUpdate);
            btnStop.Enabled = false; btnUpdate.Enabled = false;

            y += 48;

            // log
            var cap3 = SectionLabel("LIVE LOG", x, ref y);
            Controls.Add(cap3);
            txtLog = new TextBox
            {
                Left = x, Top = y + 2, Width = w, Height = 190,
                Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical,
                Font = new Font("Consolas", 9), BackColor = Coal, ForeColor = Color.FromArgb(208, 214, 220),
                BorderStyle = BorderStyle.FixedSingle
            };
            Controls.Add(txtLog);
            y += 200;

            // footer
            btnRepair = FlatBtn("Repair", x, y + 4, 80);
            btnData = FlatBtn("Open Data Folder", x + 86, y + 4, 132);
            btnQuit = FlatBtn("Quit (exit tray)", x + 224, y + 4, 110);
            btnRepair.Click += (s, e) => Action("repair");
            btnData.Click += (s, e) => Action("openData");
            btnQuit.Click += (s, e) => DoQuit();
            Controls.Add(btnRepair); Controls.Add(btnData); Controls.Add(btnQuit);
            y += 30;

            new Label
            {
                Text = "Hosted by https://convert2gif.pages.dev/  \u00b7  Closing to tray keeps the bot online (double-click tray icon to reopen).",
                Left = x, Top = y + 2, Width = w, Height = 16,
                Font = new Font("Segoe UI", 8f), ForeColor = Muted, BackColor = Color.Transparent
            }.Also(Controls.Add);
        }

        Label SectionLabel(string text, int x, ref int y)
        {
            var l = new Label
            {
                Text = text, Left = x, Top = y, Width = 300, Height = 16,
                Font = new Font("Segoe UI", 8.5f, FontStyle.Bold), ForeColor = Teal, BackColor = Color.Transparent
            };
            y += 24;
            return l;
        }

        void AddField(int x, ref int y, out Label lbl, out TextBox box, string label, int width)
        {
            lbl = new Label { Text = label, Left = x, Top = y + 3, Width = 150, Height = 16, Font = new Font("Segoe UI", 8.5f), ForeColor = Muted, BackColor = Color.Transparent };
            box = new TextBox { Left = x + 154, Top = y, Width = width, BackColor = Panel, ForeColor = Color.FromArgb(240, 242, 245), BorderStyle = BorderStyle.FixedSingle };
            y += 30;
            Controls.Add(lbl); Controls.Add(box);
        }

        Button FlatBtn(string text, int x, int y, int w, Color? back = null)
        {
            var b = new Button
            {
                Text = text, Left = x, Top = y, Width = w, Height = 28,
                FlatStyle = FlatStyle.Flat, BackColor = back ?? Panel, ForeColor = back.HasValue ? Coal : Color.FromArgb(226, 230, 235),
                Cursor = Cursors.Hand, Font = new Font("Segoe UI", 9, FontStyle.Bold)
            };
            b.FlatAppearance.BorderColor = Color.FromArgb(55, 62, 72);
            b.FlatAppearance.BorderSize = 1;
            return b;
        }

        // ---- host lifecycle ---------------------------------------------------

        void EnsureHost()
        {
            if (!string.IsNullOrEmpty(baseUrl)) return;
            if (!File.Exists(hostPath)) { SetHost("\u2014 host missing: " + HostExe + " was not found next to this app", BadDanger); return; }
            if (!foundOnce) { foundOnce = true; SpawnHost(); }
            if (discoveryTimer == null)
            {
                discoveryTimer = new System.Windows.Forms.Timer { Interval = 1500 };
                discoveryTimer.Tick += (s, e) => { if (FindHost()) { discoveryTimer.Stop(); } else SetHost("\u25CF waiting for host...", Muted); };
                discoveryTimer.Start();
            }
            if (FindHost()) discoveryTimer.Stop();
        }

        void SpawnHost()
        {
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = hostPath,
                    UseShellExecute = false,
                    WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden,
                    WorkingDirectory = exeDir,
                };
                psi.EnvironmentVariables["CONVERT2GIF_USERDATA"] = UserData;
                psi.EnvironmentVariables["CONVERT2GIF_NOBROWSER"] = "1";
                hostProc = System.Diagnostics.Process.Start(psi);
            }
            catch (Exception ex) { AppendLog("could not start host: " + ex.Message); SetHost("\u25CF host failed", BadDanger); }
        }

        bool FindHost()
        {
            int[] ports = { 45579, 45580, 45581, 45582, 45583, 45589 };
            string tok = ReadToken();
            foreach (var p in ports)
            {
                try
                {
                    var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + p + "/api/state");
                    req.Timeout = 1000;
                    req.Headers["x-c2g-token"] = tok;
                    using (var resp = (HttpWebResponse)req.GetResponse())
                    using (var sr = new StreamReader(resp.GetResponseStream()))
                    {
                        if (resp.StatusCode == HttpStatusCode.OK)
                        {
                            baseUrl = "http://127.0.0.1:" + p;
                            token = tok;
                            SetHost("\u25CF host connected", Teal);
                            return true;
                        }
                    }
                }
                catch { }
            }
            return false;
        }

        string ReadToken()
        {
            try { return File.ReadAllText(Path.Combine(UserData, "token.txt")).Trim(); }
            catch { return ""; }
        }

        void Poll()
        {
            if (closing || IsDisposed || string.IsNullOrEmpty(baseUrl)) return;
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(baseUrl + "/api/state");
                req.Timeout = 800; req.Headers["x-c2g-token"] = token;
                using (var resp = (HttpWebResponse)req.GetResponse())
                using (var sr = new StreamReader(resp.GetResponseStream()))
                {
                    string json = sr.ReadToEnd();
                    if (!IsDisposed) BeginInvoke(new Action(() => ApplyState(json)));
                }
            }
            catch { SetHost("\u25CF host lost"); ResetUrl(); }
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(baseUrl + "/api/log");
                req.Timeout = 800; req.Headers["x-c2g-token"] = token;
                using (var resp = (HttpWebResponse)req.GetResponse())
                using (var sr = new StreamReader(resp.GetResponseStream()))
                {
                    string json = sr.ReadToEnd();
                    if (!IsDisposed) BeginInvoke(new Action(() => ApplyLog(json)));
                }
            }
            catch { }
        }

        void ResetUrl() { if (baseUrl != "") { baseUrl = ""; token = ""; } }

        void ApplyState(string json)
        {
            var running = GetJson(json, "running");
            var configured = GetJson(json, "configured") == "true";
            var appVersion = GetJson(json, "appVersion");
            var installed = GetJson(json, "installed");
            var presence = GetJson(json, "presence");
            bool up = running == "running" || running == "starting";

            btnStart.Enabled = configured && !up;
            btnStop.Enabled = up;
            if (up) { lblStatus.Text = "\u25CF LIVE"; lblStatus.ForeColor = Teal; }
            else if (running == "stopping") { lblStatus.Text = "\u23F3 STOPPING"; lblStatus.ForeColor = Muted; }
            else { lblStatus.Text = "\u25CF OFFLINE"; lblStatus.ForeColor = Muted; }

            lblVer.Text = "v" + appVersion + "   \u00b7   app " + (string.IsNullOrEmpty(installed) ? "\u2014" : installed);
            SyncPresence(presence);
            if (!txtToken.Focused && string.IsNullOrEmpty(txtToken.Text)) txtToken.Text = GetJson(json, "configured") == "" ? "" : ConfigToken();
            if (!txtToken.Focused && txtToken.Text == "") { var t = ConfigToken(); if (t != "") txtToken.Text = t; }
        }

        string ConfigToken()
        {
            try
            {
                var c = File.ReadAllText(Path.Combine(UserData, "config.json"));
                return GetJson(c, "token");
            }
            catch { return ""; }
        }

        void SyncPresence(string p)
        {
            RadioButton pick = p == "idle" ? rIdle : p == "dnd" ? rDnd : p == "invisible" ? rInvis : rOnline;
            if (!pick.Checked) pick.Checked = true;
        }

        void ApplyLog(string json)
        {
            // {"lines":["...","..."]}
            int i = json.IndexOf('[');
            if (i < 0) return;
            var sb = new StringBuilder();
            int depth = 0; bool inStr = false; char prev = '\0';
            var cur = new StringBuilder();
            for (int j = i; j < json.Length; j++)
            {
                char c = json[j];
                if (c == '"' && prev != '\\') { inStr = !inStr; continue; }
                if (!inStr && c == '[') { depth++; continue; }
                if (!inStr && c == ']') { depth--; if (depth == 0) break; continue; }
                if (!inStr && c == ',') { if (cur.Length > 0) sb.AppendLine(Unescape(cur.ToString())); cur.Clear(); continue; }
                cur.Append(c);
                prev = c;
            }
            if (cur.Length > 0) sb.AppendLine(Unescape(cur.ToString()));
            var text = sb.ToString().TrimEnd('\r', '\n');
            if (text != lastLog)
            {
                lastLog = text;
                txtLog.Text = text;
                txtLog.SelectionStart = txtLog.Text.Length;
                txtLog.ScrollToCaret();
            }
        }

        string Unescape(string s)
        {
            var sb = new StringBuilder(s);
            sb.Replace("\\n", "\n").Replace("\\r", "").Replace("\\\"", "\"").Replace("\\\\", "\\");
            return sb.ToString();
        }

        string GetJson(string json, string key)
        {
            int i = json.IndexOf("\"" + key + "\"");
            if (i < 0) return "";
            i = json.IndexOf(':', i) + 1;
            while (i < json.Length && char.IsWhiteSpace(json[i])) i++;
            if (i < json.Length && json[i] == '"')
            {
                i++; var sb = new StringBuilder();
                while (i < json.Length && json[i] != '"')
                {
                    if (json[i] == '\\') { i++; }
                    if (i < json.Length) sb.Append(json[i]);
                    i++;
                }
                return sb.ToString();
            }
            var s2 = new StringBuilder();
            while (i < json.Length && (char.IsLetterOrDigit(json[i]) || json[i] == '.')) { s2.Append(json[i]); i++; }
            return s2.ToString();
        }

        // ---- actions ----------------------------------------------------------

        void SendPresence(string p) { Action("presence", p); }

        void SaveConfig()
        {
            string t = txtToken.Text.Trim(), c = txtClient.Text.Trim();
            if (t == "") { MessageBox.Show(this, "Bot token is required.", AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
            Post("{\"op\":\"saveConfig\",\"token\":\"" + J(t) + "\",\"clientId\":\"" + J(c) + "\"}");
            Action("checkUpdates");
        }

        void Action(string op) { Post("{\"op\":\"" + op + "\"}"); }

        void Action(string op, string extra) { Post("{\"op\":\"" + op + "\",\"presence\":\"" + J(extra) + "\"}"); }

        string J(string s) { return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\""); }

        void Post(string json)
        {
            if (string.IsNullOrEmpty(baseUrl)) return;
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(baseUrl + "/api/action");
                req.Method = "POST"; req.ContentType = "application/json"; req.Headers["x-c2g-token"] = token; req.Timeout = 60000;
                var bytes = Encoding.UTF8.GetBytes(json); req.ContentLength = bytes.Length;
                using (var s = req.GetRequestStream()) s.Write(bytes, 0, bytes.Length);
                using (var resp = (HttpWebResponse)req.GetResponse()) { }
            }
            catch (Exception ex) { AppendLog("action error: " + ex.Message); }
        }

        void AppendLog(string m) { txtLog.AppendText(m + Environment.NewLine); }

        void SetHost(string text, Color? c = null)
        {
            if (InvokeRequired) { try { BeginInvoke(new Action(() => SetHost(text, c))); return; } catch { return; } }
            lblHost.Text = text; lblHost.ForeColor = c ?? Muted;
        }

        void DoQuit()
        {
            closing = true;
            try { Post("{\"op\":\"quit\"}"); } catch { }
            TaskDelay(() =>
            {
                try { if (hostProc != null && !hostProc.HasExited) hostProc.Kill(); } catch { }
                tray.Visible = false;
                Application.Exit();
            }, 500);
        }

        void TaskDelay(Action a, int ms)
        {
            var t = new System.Threading.Timer(_ => a(), null, ms, System.Threading.Timeout.Infinite);
            GC.KeepAlive(t);
        }

        protected override void OnLoad(EventArgs e)
        {
            base.OnLoad(e);
            if (File.Exists(hostPath) == false)
            {
                MessageBox.Show(this, HostExe + " was not found next to this app. Re-download the full zip.", Name, MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            tray = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Text = "Convert2GIF",
                Visible = true,
            };
            trayMenu = new ContextMenu();
            trayMenu.MenuItems.Add("Open", (s, ev) => { Show(); WindowState = FormWindowState.Normal; Activate(); });
            trayMenu.MenuItems.Add("-");
            trayMenu.MenuItems.Add("Quit", (s, ev) => DoQuit());
            tray.ContextMenu = trayMenu;
            tray.DoubleClick += (s, ev) => { Show(); WindowState = FormWindowState.Normal; Activate(); };
            showBalloon = true;
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!closing)
            {
                e.Cancel = true;
                Hide();
                if (showBalloon)
                {
                    showBalloon = false;
                    tray.ShowBalloonTip(1500, "Convert2GIF", "Still hosting — double-click the tray icon to reopen.", ToolTipIcon.Info);
                }
                return;
            }
            base.OnFormClosing(e);
        }
    }

    static class Ext
    {
        public static T Also<T>(this T o, Action<T> act) { act(o); return o; }
    }
}