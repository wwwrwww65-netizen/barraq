const fs = require('fs');
let c = fs.readFileSync('main.js', 'utf8');

const targetStr = `ipcMain.on('wa-show-window', (event, phoneUrl) => {
  if (waNativeWin) {
    waNativeWin.setOpacity(1);`;

const replaceStr = `ipcMain.on('wa-show-window', (event, phoneUrl) => {
  if (waNativeWin) {
    if (phoneUrl) waNativeWin.loadURL(phoneUrl);
    waNativeWin.setOpacity(1);`;

c = c.replace(targetStr, replaceStr);

// Also try with \r\n if \n doesn't work
const targetStrCrLf = `ipcMain.on('wa-show-window', (event, phoneUrl) => {\r\n  if (waNativeWin) {\r\n    waNativeWin.setOpacity(1);`;
const replaceStrCrLf = `ipcMain.on('wa-show-window', (event, phoneUrl) => {\r\n  if (waNativeWin) {\r\n    if (phoneUrl) waNativeWin.loadURL(phoneUrl);\r\n    waNativeWin.setOpacity(1);`;

c = c.replace(targetStrCrLf, replaceStrCrLf);

fs.writeFileSync('main.js', c);
