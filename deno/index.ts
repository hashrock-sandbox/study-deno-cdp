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

async function SEND(ws, command) {
    await ws.send(JSON.stringify(command));
    let result = ""
    for await (const msg of ws.receive()) {
        if (typeof msg === "string") {
            result = msg
            const obj = JSON.parse(result)
            if (obj.id === command.id) {
                break;
            }
        }
    }
    console.log(result)
    return JSON.parse(result)
}

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

    const ws = await connectWebSocket(wsUrl);
    console.log(green("ws connected! (type 'close' to quit)"));

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
        id: 3, // Note that IDs are independent between sessions.
        method: "Page.navigate",
        params: {
            url: "https://pptr.dev"
        }
    });

    await SEND(ws, {
        sessionId,
        id: 4, // Note that IDs are independent between sessions.
        method: "Runtime.addBinding",
        params: {
            name: "hello"
        }
    });

    for await (const msg of ws.receive()) {
        if (typeof msg === "string") {
            console.log(msg)
            break;
        }
    }
}
main()
