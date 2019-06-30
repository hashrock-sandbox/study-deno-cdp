import * as find from "../deno/find-chrome.ts";
import { connectWebSocket } from "https://deno.land/std/ws/mod.ts";

async function SEND(ws, command) {
  await ws.send(JSON.stringify(command));
  let result = "";
  for await (const msg of ws.receive()) {
    if (typeof msg === "string") {
      result = msg;
      const obj = JSON.parse(result);
      if (obj.id === command.id) {
        break;
      }
    }
  }
  console.log(result);
  return JSON.parse(result);
}

async function execChrome(){
  const width = 400;
  const height = 400;
  const dirName = await Deno.makeTempDir({ prefix: "deno_chrome_temp" });
  const args = [
    "--no-first-run", //ようこそみたいなのが表示されるのを防止
    "--disable-default-apps",
    "--remote-debugging-port=9222",
    "--user-data-dir=" + dirName, //これがないとDevToolの接続受け付けてくれない
    "--app=https://deno.land/",
    "--disable-sync",
    `--window-size=${width},${height}`
  ];
  const path = await find.findChrome();
  const proc = Deno.run({
    args: [path.executablePath, ...args],
    stdout: "piped",
    stderr: "piped"
  });
  return proc
}
async function getWebsocketEndpoint(proc){
  const buf = new Uint8Array(1000);
  await proc.stderr.read(buf);
  const text = new TextDecoder().decode(buf);

  const dev = text
    .toString()
    .split(/\r?\n/)
    .find(i => i.indexOf("DevTools listening on ") >= 0);

  return dev.replace("DevTools listening on ", "");
}

async function getSession(ws){
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
  return sessionId;
}

export class Chrome{
  sessionId: string = ""
  id: number = 0
  ws: any;
  async connect(){
    const proc = await execChrome()
    const wsUrl = await getWebsocketEndpoint(proc)
    this.ws = await connectWebSocket(wsUrl);
    this.sessionId = await getSession(this.ws)
    this.id = 2;
  }
  send(method: string, params: any){
    this.id++
    return SEND(this.ws, {
      sessionId: this.sessionId,
      id: this.id, // Note that IDs are independent between sessions.
      method: method,
      params: params
    });
  }
}
