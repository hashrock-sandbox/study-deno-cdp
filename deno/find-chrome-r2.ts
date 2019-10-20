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


'use strict';
const {env, run, lstat, ErrorKind} = Deno;
import * as path from "https://deno.land/std/fs/path.ts";
import {xrun} from "https://raw.githubusercontent.com/denoland/deno_std/master/prettier/util.ts"

// const fs = require('fs');
// const path = require('path');
const execSync = require('child_process').execSync;
const execFileSync = require('child_process').execFileSync;
// const puppeteer = require('puppeteer-core');

const newLineRegex = /\r?\n/;

async function execute(args: string[]) {
  const proc = run({ args: args, stdout: "piped" })
  return new TextDecoder().decode(await proc.output())
}

function darwin(canary) {
  const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework' +
      '/Versions/A/Frameworks/LaunchServices.framework' +
      '/Versions/A/Support/lsregister';
  const grepexpr = canary ? 'google chrome canary' : 'google chrome';
  const result =
      execSync(`${LSREGISTER} -dump  | grep -i \'${grepexpr}\\?.app$\' | awk \'{$1=""; print $0}\'`);

  const installations = new Set();
  const paths = result.toString().split(newLineRegex).filter(a => a).map(a => a.trim());
  paths.unshift(canary ? '/Applications/Google Chrome Canary.app' : '/Applications/Google Chrome.app');
  for (const p of paths) {
    if (p.startsWith('/Volumes'))
      continue;
    const inst = path.join(p, canary ? '/Contents/MacOS/Google Chrome Canary' : '/Contents/MacOS/Google Chrome');
    if (canAccess(inst))
      return inst;
  }
}

/**
 * Look for linux executables in 3 ways
 * 1. Look into CHROME_PATH env variable
 * 2. Look into the directories where .desktop are saved on gnome based distro's
 * 3. Look for google-chrome-stable & google-chrome executables by using the which command
 */
function linux(canary) {
  let installations = [];
  const { HOME } = env();

  // Look into the directories where .desktop are saved on gnome based distro's
  const desktopInstallationFolders = [
    path.join(HOME, '.local/share/applications/'),
    '/usr/share/applications/',
  ];
  desktopInstallationFolders.forEach(folder => {
    installations = installations.concat(findChromeExecutables(folder));
  });

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
      if (canAccess(chromePath))
        installations.push(chromePath);
      } catch (e) {
      // Not installed.
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

  if (process.env.CHROME_PATH)
    priorities.unshift({regex: new RegExp(`${process.env.CHROME_PATH}`), weight: 101});

  return sort(uniq(installations.filter(Boolean)), priorities)[0];
}

function win32(canary) {
  const suffix = canary ?
    `${path.sep}Google${path.sep}Chrome SxS${path.sep}Application${path.sep}chrome.exe` :
    `${path.sep}Google${path.sep}Chrome${path.sep}Application${path.sep}chrome.exe`;
  const prefixes = [
    process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']
  ].filter(Boolean);

  let result;
  prefixes.forEach(prefix => {
    const chromePath = path.join(prefix, suffix);
    if (canAccess(chromePath))
      result = chromePath;
  });
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

function uniq(arr) {
  return Array.from(new Set(arr));
}

function findChromeExecutables(folder) {
  const argumentsRegex = /(^[^ ]+).*/; // Take everything up to the first space
  const chromeExecRegex = '^Exec=\/.*\/(google-chrome|chrome|chromium)-.*';

  const installations = [];
  if (canAccess(folder)) {
    // Output of the grep & print looks like:
    //    /opt/google/chrome/google-chrome --profile-directory
    //    /home/user/Downloads/chrome-linux/chrome-wrapper %U
    let execPaths;

    // Some systems do not support grep -R so fallback to -r.
    // See https://github.com/GoogleChrome/chrome-launcher/issues/46 for more context.
    try {
      execPaths = execSync(`grep -ER "${chromeExecRegex}" ${folder} | awk -F '=' '{print $2}'`);
    } catch (e) {
      execPaths = execSync(`grep -Er "${chromeExecRegex}" ${folder} | awk -F '=' '{print $2}'`);
    }

    execPaths = execPaths.toString()
        .split(newLineRegex)
        .map(execPath => execPath.replace(argumentsRegex, '$1'));

    execPaths.forEach(execPath => canAccess(execPath) && installations.push(execPath));
  }

  return installations;
}


async function findChrome(options) {
  if (options.executablePath)
    return { executablePath: options.executablePath, type: 'user' };

  type OS = 'linux' | 'win' | 'mac'
  const platform: OS = platform.os;

  const config = new Set(options.channel || ['stable']);
  let executablePath;
  // Always prefer canary.
  if (config.has('canary') || config.has('*')) {
    if (platform === 'linux')
      executablePath = linux(true);
    else if (platform === 'win')
      executablePath = win32(true);
    else if (platform === 'mac')
      executablePath = darwin(true);
    if (executablePath)
      return { executablePath, type: 'canary' };
  }

  // Then pick stable.
  if (config.has('stable') || config.has('*')) {
    if (platform === 'linux')
      executablePath = linux();
    else if (platform === 'win')
      executablePath = win32();
    else if (platform === 'mac')
      executablePath = darwin();
    if (executablePath)
      return { executablePath, type: 'stable' };
  }

  // always prefer puppeteer revision of chromium
  // if (config.has('chromium') || config.has('*')) {
  //   const revisionInfo = await downloadChromium(options);
  //   return { executablePath: revisionInfo.executablePath, type: revisionInfo.revision };
  // }

  // for (const item of config) {
  //   if (!item.startsWith('r'))
  //     continue;
  //   const revisionInfo = await downloadChromium(options, item.substring(1));
  //   return { executablePath: revisionInfo.executablePath, type: revisionInfo.revision };
  // }

  return {};
}

module.exports = findChrome;