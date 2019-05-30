import * as find from "./find-chrome.ts"
import {
    connectWebSocket,
    isWebSocketCloseEvent,
    isWebSocketPingEvent,
    isWebSocketPongEvent
} from "./mod_ws_without_handshake.ts";
import { encode } from "https://deno.land/std/strings/mod.ts";
import { BufReader } from "https://deno.land/std/io/bufio.ts";
import { TextProtoReader } from "https://deno.land/std/textproto/mod.ts";
import { blue, green, red, yellow } from "https://deno.land/std/colors/mod.ts";
async function main() {
    const width = 400;
    const height = 400;
    const dirName = "temp";
    const args = [
        "--no-first-run", //ようこそみたいなのが表示されるのを防止
        "--disable-default-apps",
        "--remote-debugging-port=9222",
        "--user-data-dir=/" + dirName, //これがないとDevToolの接続受け付けてくれない
        "--app=https://deno.land/",
        "--disable-sync",
        `--window-size=${width},${height}`
    ];
    const path = await find.findChrome()
    const proc = Deno.run({ args: [path.executablePath, ...args], stdout: "piped", stderr: "piped" })
    const buf = new Uint8Array(1000)
    await proc.stderr.read(buf)
    const text = new TextDecoder().decode(buf)

    const dev = text
        .toString()
        .split("\r\n")
        .find(i => i.indexOf("DevTools listening on ") >= 0);

    const wsUrl = dev.replace("DevTools listening on ", "");
    console.log(wsUrl);

    const sock = await connectWebSocket(wsUrl);
    console.log(green("ws connected! (type 'close' to quit)"));

    (async function (): Promise<void> {
        for await (const msg of sock.receive()) {
            if (typeof msg === "string") {
                console.log(yellow("< " + msg));
            } else if (isWebSocketPingEvent(msg)) {
                console.log(blue("< ping"));
            } else if (isWebSocketPongEvent(msg)) {
                console.log(blue("< pong"));
            } else if (isWebSocketCloseEvent(msg)) {
                console.log(red(`closed: code=${msg.code}, reason=${msg.reason}`));
            }
        }
    })();

    const payload = JSON.stringify({
        id: 1,
        method: "Target.getTargets"
    })


    await sock.send(payload);

}
main()
