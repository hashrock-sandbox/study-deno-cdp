import * as find from "./deno/find-chrome.ts";

async function main(){
  const path = await find.findChrome();
  console.log(path)
}

main()
