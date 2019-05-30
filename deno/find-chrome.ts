/**
 * Copyright 2018 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

 /**
 * taken from https://github.com/GoogleChromeLabs/carlo/blob/master/lib/find_chrome.js
 * Deno ported by hashrock
 */

import * as path from "https://deno.land/std/fs/path.ts";
const {env, run, platform, lstat, ErrorKind} = Deno;

const newLineRegex = /\r?\n/;

async function execute(args: string[]) {
  const proc = run({ args: args, stdout: "piped" })
  return new TextDecoder().decode(await proc.output())
}

async function canAccess(file) {
  try {
    const fileInfo = await lstat(file);
    return fileInfo.isFile() || fileInfo.isDirectory()
  } catch (e) {
    if (e.kind !== ErrorKind.NotFound) {
      console.error(e)
    } else {
      console.log("Not Found: " + file)
    }
  }
  return false
}

async function darwin(canary) {
  const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework' +
      '/Versions/A/Frameworks/LaunchServices.framework' +
      '/Versions/A/Support/lsregister';
  const grepexpr = canary ? 'google chrome canary' : 'google chrome';
  const result = await execute([LSREGISTER,"-dump"]);
  const regex = new RegExp(`${grepexpr}\?.app$`, "ig")
  const paths = result.split(newLineRegex).filter(i=>i.match(regex)).map(i=>i.replace(/\tpath: +/, ""))

  for (const p of paths) {
    if (p.startsWith('/Volumes'))
      continue;
    const inst = path.join(p, canary ? '/Contents/MacOS/Google Chrome Canary' : '/Contents/MacOS/Google Chrome');
    if (canAccess(inst))
      return inst;

  }
  return undefined
}

/**
 * Look for linux executables in 3 ways
 * 1. Look into CHROME_PATH env variable
 * 2. Look into the directories where .desktop are saved on gnome based distro's
 * 3. Look for google-chrome-stable & google-chrome executables by using the which command
 */
async function linux(canary) {
  let installations = [];
  const { HOME } = env();
  // Look into the directories where .desktop are saved on gnome based distro's
  const desktopInstallationFolders = [
    path.join(HOME, '.local/share/applications/'),
    '/usr/share/applications/',
  ];

  for(const folder of desktopInstallationFolders){
    installations = installations.concat(await findChromeExecutables(folder));
  }

  // Look for google-chrome(-stable) & chromium(-browser) executables by using the which command
  const executables = [
    'google-chrome-stable',
    'google-chrome',
    'chromium-browser',
    'chromium',
  ];
  for(const executable of executables){
    try {
      const output = await execute(['which', ...executable])
      const chromePath = output
          .toString().split(newLineRegex)[0];
      installations.push(chromePath);
    } catch (e) {
      // Not installed.
    }
  }

  if (!installations.length)
    throw new Error('The environment variable CHROME_PATH must be set to executable of a build of Chromium version 54.0 or later.');

  const priorities = [
    {regex: /chrome-wrapper$/, weight: 51},
    {regex: /google-chrome-stable$/, weight: 50},
    {regex: /google-chrome$/, weight: 49},
    {regex: /chromium-browser$/, weight: 48},
    {regex: /chromium$/, weight: 47},
  ];

  return sort(uniq(installations.filter(Boolean)), priorities)[0];
}

async function win32(canary) {
  const suffix = canary ?
    `${path.sep}Google${path.sep}Chrome SxS${path.sep}Application${path.sep}chrome.exe` :
    `${path.sep}Google${path.sep}Chrome${path.sep}Application${path.sep}chrome.exe`;
    const ev = env()

  const prefixes = [
    ev.LOCALAPPDATA, ev.PROGRAMFILES, ev['ProgramFiles(x86)']
  ].filter(Boolean);

  let result;
  for(let prefix of prefixes){
    const chromePath = path.join(prefix, suffix);
    if (await canAccess(chromePath)){
      result = chromePath;
    }
  }

  return result;
}

function sort(installations, priorities) {
  const defaultPriority = 10;
  return installations
      // assign priorities
      .map(inst => {
        for (const pair of priorities) {
          if (pair.regex.test(inst))
            return {path: inst, weight: pair.weight};
        }
        return {path: inst, weight: defaultPriority};
      })
      // sort based on priorities
      .sort((a, b) => (b.weight - a.weight))
      // remove priority flag
      .map(pair => pair.path);
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

async function findChromeExecutables(folder) {
  const argumentsRegex = /(^[^ ]+).*/; // Take everything up to the first space
  const chromeExecRegex = '^Exec=\/.*\/(google-chrome|chrome|chromium)-.*';

  const installations = [];
    // Output of the grep & print looks like:
    //    /opt/google/chrome/google-chrome --profile-directory
    //    /home/user/Downloads/chrome-linux/chrome-wrapper %U
    let execPaths;

    // Some systems do not support grep -R so fallback to -r.
    // See https://github.com/GoogleChrome/chrome-launcher/issues/46 for more context.
    try {
      execPaths = await execute([`grep -ER "${chromeExecRegex}" ${folder} | awk -F '=' '{print $2}'`])
    } catch (e) {
      execPaths = await execute([`grep -Er "${chromeExecRegex}" ${folder} | awk -F '=' '{print $2}'`])
    }

    execPaths = execPaths.toString()
        .split(newLineRegex)
        .map(execPath => execPath.replace(argumentsRegex, '$1'));

    execPaths.forEach(execPath => installations.push(execPath));

  return installations;
}

export async function findChrome() {
  let executablePath
  console.log(platform.os)

  // I think Deno users Always prefer canary by nature.
  if (platform.os === 'linux')
    executablePath = await linux(true);
  else if (platform.os === 'win')
    executablePath = await win32(true);
  else if (platform.os === 'mac')
    executablePath = await darwin(true);
  if (executablePath)
    return { executablePath, type: 'canary' };

    console.log("not found")

  // Then pick stable.
  if (platform.os === 'linux')
    executablePath = await linux(false);
  else if (platform.os === 'win')
    executablePath = await win32(false);
  else if (platform.os === 'mac')
    executablePath = await darwin(false);
  if (executablePath)
    return { executablePath, type: 'stable' };

  // We don't need download chromium for Deno.
  return {};
}
