const width = 400;
const height = 400;
const dirName = "temp";
const { spawn } = require("child_process");
const chrome =
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const WebSocket = require("ws");

const args = [
  "--no-first-run", //ようこそみたいなのが表示されるのを防止
  "--disable-default-apps",
  "--remote-debugging-port=9222",
  "--user-data-dir=/" + dirName, //これがないとDevToolの接続受け付けてくれない
  "--app=https://deno.land/",
  "--disable-sync",
  `--window-size=${width},${height}`
];
function SEND(ws, command) {
  ws.send(JSON.stringify(command));
  return new Promise(resolve => {
    ws.on("message", function(text) {
      const response = JSON.parse(text);
      if (response.id === command.id) {
        ws.removeListener("message", arguments.callee);
        resolve(response);
      }
    });
  });
}
const bat = spawn(chrome, args);
bat.stderr.on("data", data => {
  const dev = data
    .toString()
    .split("\r\n")
    .find(i => i.indexOf("DevTools listening on ") >= 0);

  if (dev) {
    const wsUrl = dev.replace("DevTools listening on ", "");
    console.log(wsUrl);
    const ws = new WebSocket(wsUrl);
    let sessionId = "";

    ws.on("open", async function open() {
      const targetsResponse = await SEND(ws, {
        id: 1,
        method: "Target.getTargets"
      });
      const pageTarget = targetsResponse.result.targetInfos.find(
        info => info.type === "page"
      );

      const sessionId = (await SEND(ws, {
        id: 2,
        method: "Target.attachToTarget",
        params: {
          targetId: pageTarget.targetId,
          flatten: true
        }
      })).result.sessionId;

      // Navigate the page using the session.
      await SEND(ws, {
        sessionId,
        id: 1, // Note that IDs are independent between sessions.
        method: "Page.navigate",
        params: {
          url: "https://pptr.dev"
        }
      });

      await SEND(ws, {
        sessionId,
        id: 1, // Note that IDs are independent between sessions.
        method: "Runtime.addBinding",
        params: {
            name: "hello"
        }
      });

      console.log("Startup")
      ws.on("message", function incoming(data) {
        console.log(data);
      });
    });

  }
});
