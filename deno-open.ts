import {
    connectWebSocket,
    isWebSocketCloseEvent,
    isWebSocketPingEvent,
    isWebSocketPongEvent
  } from "https://deno.land/std/ws/mod.ts";
  import { encode } from "https://deno.land/std/strings/mod.ts";
  import { BufReader } from "https://deno.land/std/io/bufio.ts";
  import { TextProtoReader } from "https://deno.land/std/textproto/mod.ts";
  import { blue, green, red, yellow } from "https://deno.land/std/colors/mod.ts";
  async function main(): Promise<void> {
    const sock = await connectWebSocket("ws://localhost:9222");  
  }

  main()