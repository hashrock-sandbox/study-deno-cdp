import { Chrome } from "./lib/cdp-utils.ts";

async function main(){
  const chrome = new Chrome();
  await chrome.connect();
  await chrome.send("Page.navigate", {
    url: "http://localhost:5000/"
  })
  await chrome.send("Runtime.addBinding", {
    name: "hello"
  })
  for await (const msg of chrome.ws.receive()) {
    if (typeof msg === "string") {
      console.log("Function called", msg);
      // break;
    }
  }
}


main()