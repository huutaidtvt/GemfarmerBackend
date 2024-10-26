const { app, BrowserWindow, session, ipcMain, dialog, shell } = require('electron');
var adb = require('adbkit')
var client = adb.createClient()
const path = require('path');
const license = require('./license');
const { spawn, exec } = require('child_process');
var splashWindow = null;
var mainWindow = null;
let deviceValid;
let deviceCode;
let deviceWindow = null;
const pathWeb = path.join("D:\\genlogin\\farmer\\gemfarmer", "build");
//const pathWeb = path.join(process.resourcesPath, "..\\..\\build");
//const pathWeb = path.join(process.resourcesPath, "..\\bin\\build");
const pathPreload = path.join(__dirname, 'preload.js');
const osPaths = require('os-paths/cjs');
const pathRoot = osPaths.home() + "\\.gemFamer";
let download = require('./download');
const { Sequelize, where, Op } = require('sequelize');
const sequelize = require('./configs/database');
const Scripts = require('./models/Script');
const Device = require('./models/Device');
const fs = require('fs');
//server express
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const { startScrcpy, stopScrcpy } = require('./scrcpy');
const { checkAndInstallApks, checkAndInstallAtxAgent, getDeviceInfo } = require('./checkAppStart')
const { pressBack, pressHome, pressMenu, deviceActions, touch, getAttribute, elementExists, typeText, screenShot, pressKey, swipeScroll, transferFile, toggleService, isInStallApp, unInStallApp, inStallApp, stopApp, startApp, generate2FA, adbShell, imapReadMail, actionFile } = require('./adbFunctions')
var listDevice = [];
let isUpdate = false;
//startScrcpy();
runServer();





async function createWindow() {
  session.defaultSession.loadExtension(pathWeb).then((data) => {
    mainWindow.loadURL(data.url + "/newtab.html#");
  });


  createSplashWindow();
  // let checkRun = await isRunning("gemLogin.exe");
  // if (checkRun) {
  //   exec(`taskkill /im gemLogin.exe /f`, (err, stdout, stderr) => {
  //   })
  // }
  // listApp(2)
  // searchApp("panda")
  // downloadAPK("com.zing.zalo")


  mainWindow = new BrowserWindow({
    width: 1500,
    minWidth: 1500,
    height: 800,
    minHeight: 800,
    backgroundColor: "#ccc",
    icon: __dirname + "/logo.png",
    backgroundColor: '#EEEEEE',
    // transparent: true,
    backgroundColor: '#EEEEEE',
    frame: true,
    show: false,
    center: true,
    webPreferences: {
      //  nodeIntegration: false, //
      contextIsolation: true, //
      preload: pathPreload
    }
  });

  mainWindow.removeMenu();
  mainWindow.webContents.openDevTools();

  //mainWindow.maximize();

  mainWindow.webContents.on('did-fail-load',
    function (event, errorCode, errorDescription) {
      setTimeout(function () {
        mainWindow.webContents.reload();
      }, 350);
    }
  );

  mainWindow.webContents.on('did-finish-load', function () {
    if (splashWindow !== null) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });

  mainWindow.on('close', function (e) {
    if (!isUpdate) {
      let response = dialog.showMessageBoxSync(this, {
        type: 'question',
        buttons: ['Yes', 'No'],
        title: 'Confirm closing app',
        message: 'Are you sure you want to quit?'
      });

      if (response == 1) {
        stopScrcpy();
        e.preventDefault();
      }
    }
  });

  // ipcMain.handle("searchApp", async (event, data) => {
  //   console.log("data =>", data);
  //   let { key, page, limit } = data;
  //   return searchApp(key, page, limit);
  // });

  // ipcMain.handle("downloadApp", async (event, data) => {
  //   console.log("data =>", data);
  //   let { id, version } = data;
  //   return await downloadAPK(id, version);
  // });

  // ipcMain.handle("getListApp", async (event, data) => {
  //   console.log("data =>", data);
  //   let { page, limit } = data;
  //   return listApp(page, limit);
  // });
  ipcMain.handle("reloadData", async (event, data) => {
   let devices=await client.listDevices();
   
  })
  ipcMain.handle("sendData", async (event, data) => {
    let device_id = data.deviceId;
    console.log(data);
    let p = listDevice.find(c => c.device_id == device_id);
    if (p) {
      const port = p.port;
      switch (data.type) {
        // Run oke
        case "pressMenu": {
          return await pressMenu(device_id);
        }

        case "pressHome": {
          return await pressHome(device_id);

        }

        case "pressBack": {
          return await pressBack(device_id);
        }

        case "deviceAction": {
          return await deviceActions(device_id, data.data.action);
        }

        case "startApp": {
          return await startApp(device_id, data.data.packageName);

        }

        case "stopApp": {
          return await stopApp(device_id, data.data.packageName);

        }

        case "uninstallApp": {
          return await unInStallApp(device_id, data.data.ValuePackageName);

        }

        case "swipeScroll": {
          return await swipeScroll(port, data.data.mode, { direction: data.data.direction, startX: data.data.startX, startY: data.data.startY, endX: data.data.endX, endY: data.data.endY, duration: data.data.duration });

        }

        case "typeText": {
          return await typeText(port, device_id, data.data.selector, data.data.timeout, data.data.inputText);
        }
        case "tonggleService": {
          return await toggleService(device_id, data.data.action);

        }

        case "pressKeyPhone": {
          return await pressKey(port, data.data.keyCode);

        }

        case "adbShellCommand": {
          return await adbShell(device_id, data.data.command);
        }

        case "touch": {
          return await touch(device_id, data.data.selectBy, { xpathQuery: data.data.xPath, timeOut: data.data.timeOut, xCoordinate: data.data.xCoordinate, yCoordinate: data.data.yCoordinate }, data.data.type, data.data.delay);

        }

        case "fileAction": {
          return actionFile(data.data.action, data.data.filePath, data.data.inputData, data.data.selectorType, data.data.writeMode, data.data.appendMode, data.data.delimiter);

        }

        case "imapReadMail": {
          return await imapReadMail(
            data.data.emailService,
            data.data.email,
            data.data.password,
            data.data.mailBox,
            {
              unseen: data.data.isUnseen,
              markAsRead: data.data.isMark,
              latestMail: data.data.isGetLatest,
              from: data.data.includesFrom,
              to: data.data.includesTo,
              subject: data.data.includesSubject,
              body: data.data.includesBody,
              minutesAgo: data.data.readEmailMinute,
              flags: { g: data.data.isGlobal, i: data.data.isCaseInsensitive, m: data.data.isMultiline }
            },
            data.data.regex,
            data.data.timeOut,
            data.data.imapHost,
            data.data.imapPort,
            data.data.isTLS
          )
        }

        case "getAttribute": {
          return await getAttribute(port, data.data.xPath, data.data.name, data.data.timeOut);
        }

        case "isInstallApp": {
          return await isInStallApp(device_id, data.data.packageName);
        }

        case "ElementExists": {
          return await elementExists(port, data.data.xPath, data.data.timeOut);

        }

        case "generate2FA": {
          return await generate2FA(device_id, data.data.secretKey);

        }

        // Đang lỗi chưa fix được

        case "inStallApp": {
          return await inStallApp(device_id, data.data.apkPath);

        }

        case "transferFile": {
          return await transferFile(device_id, data.data.action, data.data.localFilePath, data.data.remoteFilePath);

        }

        case "screenShot": {
          return await screenShot(port, data.data);

        }

      }
    }
    else {
      return { success: false, message: "device offline" }
    }
    // console.log(data);
  })
  ipcMain.handle('getIdDevice', async (event, data) => {
    if (!deviceCode) {
      deviceCode = await license.getIdDevice();
    }
    return deviceCode;
  });
  ipcMain.handle("checkLicense", async (event, data) => {
    try {
      data = JSON.parse(data);
      if (!deviceCode) {
        deviceCode = await license.getIdDevice();
      }
      data.deviceId = deviceCode;
      deviceValid = await license.checkLicense(data);
      return deviceValid;
    } catch (error) {
      writelog(error);
      return { success: false, message: error }
    }
  });

  ipcMain.handle('crudScript', async (event, data) => {
    data = JSON.parse(data);
    switch (data.action) {
      case "getAll": {
        let result = await Scripts.findAll({ raw: true });
        result = result.reduce((acc, current) => {
          acc[current.id] = JSON.parse(current.script);

          return acc;
        }, {})

        return result;
      }; break;
      case "create": {
        return await Scripts.create({ id: data.script.id, name: data.script.name, description: data.script.description, version: data.script.version, script: JSON.stringify(data.script) });
      }; break;
      case "update": {
        return await Scripts.update({ id: data.script.id, name: data.script.name, description: data.script.description, version: data.script.version, script: JSON.stringify(data.script) }, { where: { id: data.script.id } })
      };
      case "delete": {
        return await Scripts.destroy({ where: { id: data.id } })
      };
    }
  });
  ipcMain.on("startUpdate", (event, data) => {
    data = JSON.parse(data);
    download.DownloadFile(data.url, pathRoot + "\\update", "setup.exe", mainWindow, "onUpdate")
  })
  ipcMain.on("openLink", (event, data) => {
    shell.openExternal(data);
  });
  ipcMain.on("openDevice", (event, data) => {
    console.log(data);
    openAboutWindow(data.deviceId);
  })

  ipcMain.handle("initLaucher", async () => {
    {
      await sequelize.sync();
      Device.update({ status: 'offline' }, { where: { id: { [Op.not]: null } } });
      // connectWebSocket(mainWindow);
      initLaucher();
      trackDevice();
    }
  })
  ipcMain.handle('quitAndInstall', () => {
    try {
      if (fs.existsSync(`${pathRoot}\\update\\setup.exe`)) {
        exec(`setup.exe`, { cwd: `${pathRoot}\\update` }, (err, stdout, stderr) => {
        });
        setTimeout(() => {
          isUpdate = true;
          exec(`taskkill /im gemLogin.exe /f`, (err, stdout, stderr) => { })
          app.quit();
        }, 2000);
      }
    } catch (error) {
    }
  });
  ipcMain.handle('getDeviceList', async (event, data) => {
    const devices = await Device.findAll({ raw: true });
    return { success: true, message: "success", data: devices };
  })
}
function openAboutWindow(deviceId) {
  if (deviceWindow) {
    deviceWindow.focus();
    return
  }

  deviceWindow = new BrowserWindow({
    height: 700,
    resizable: true,
    width: 270,
    icon: __dirname + "/logo.png",
  });

  deviceWindow.setMenu(null); // here!
  deviceWindow.loadURL(`http://localhost:8000/#!action=stream&controls=true&controlButtons=false&udid=${deviceId}&player=tinyh264&ws=ws%3A%2F%2Flocalhost%3A8000%2F%3Faction%3Dproxy-adb%26remote%3Dtcp%253A8886%26udid%3D${deviceId}`).then(r => r);
  deviceWindow.on('closed', () => deviceWindow = null);
}

function createSplashWindow() {
  if (splashWindow === null) {
    var imagePath = path.join(__dirname, "splash.jpg");
    splashWindow = new BrowserWindow({
      width: 544,
      height: 278,
      frame: false,
      show: true,
      transparent: true,
      opacity: 0.5,
      images: true,
      center: true,
      'alwaysOnTop': true,
      'skipTaskbar': true,
      'useContentSize': true
    });
    splashWindow.loadURL(imagePath);
  }
}
app.on('ready', createWindow)

app.on('window-all-closed', function () {

  exec(`taskkill /im image-finder-v3.exe /f`, (err, stdout, stderr) => {
  })
  app.quit()
})
async function initLaucher() {
  try {
    if (!fs.existsSync(pathRoot)) {
      fs.mkdirSync(pathRoot)
    }
    let pathImageSearch = pathRoot + "\\image-finder-v3.exe"
    if (!fs.existsSync(pathImageSearch)) {
      download.DownloadFile("https://s3-hcm5-r1.longvan.net/gemlogin/downloads/image-finder-v3.exe", pathRoot, "image-finder-v3.exe", mainWindow, "");
    }
  } catch (error) {
    writelog(error)
  }

}
function writelog(message) {
  let pathLog = pathRoot + "\\log";
  if (!fs.existsSync(pathLog)) {
    fs.mkdirSync(pathLog);
  }
  const date = new Date();
  let name = 'Log_' + date.getDate() + date.getMonth() + date.getFullYear() + '.log';
  let filelog = pathLog + "\\" + name;
  fs.appendFileSync(filelog, "--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------\r\n", 'utf8');
  fs.appendFileSync(filelog, message + "\r\n", 'utf8');
}

function runServer() {
  const appExpress = express();
  const port = 5555;
  appExpress.use(cors());
  appExpress.use(bodyParser.json());
  appExpress.get('/devices', async function (req, res) {
    let result = await client.listDevices();
    res.json(result);
  });
  appExpress.get('/capture/:deviceId', async (req, res) => {
    let deviceId = req.params.deviceId;
    let p = listDevice.find(c => c.device_id == deviceId);
    if (!p) res.json({ success: false, message: "device Offline" });
    let address = `http://127.0.0.1:${p.port}/jsonrpc/0`;
    let bodys = [
      {
        "jsonrpc": "2.0",
        "id": "da9ad2c67b104c65855117569c5fdcd2",
        "method": "dumpWindowHierarchy",
        "params": [
          false,
          50
        ]
      },
      {
        "jsonrpc": "2.0",
        "id": "da9ad2c67b104c65855117569c5fdcd2",
        "method": "takeScreenshot",
        "params": [
          1,
          80
        ]
      },
      {
        "jsonrpc": "2.0",
        "id": "3a982f85d17842e2955e8e5b26313ceb",
        "method": "deviceInfo",
        "params": []
      }

    ];
    response = await Promise.all(bodys.map(async (c) => {
      try {
        let result = await fetch(address,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(c)
          }

        );
        const data = await result.json();
        return data;

      }
      catch (ex) { console.log(ex); return null }
    }));
    console.log(response)
    res.json({
      source: response[0].result,
      screenshot: response[1].result,
      windowSize: {
        width: response[2].result.displayWidth,
        height: response[2].result.displayHeight,
        x: 0,
        y: 0
      },
      commandRes: {}
    })

  });
  appExpress.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
  })
}

function trackDevice() {
  client.trackDevices()
    .then(function (tracker) {
      tracker.on('add', async function (device) {
        console.log(device)

        let deviceFind = await Device.findOne({ where: { device_id: device.id } });
        if (!deviceFind) {
          setTimeout(async () => {
            const deviceInfo = await getDeviceInfo(device.id);
            await Device.create({
              name: deviceInfo.model,
              version: deviceInfo.releaseVersion,
              manufacturer: deviceInfo.brand,
              cpu: deviceInfo.cpuAbi,
              device_id: device.id, // Sử dụng `udid` làm `name` để đảm bảo tính duy nhất
              status: 'online', // Cập nhật trạng thái thiết bị
              lastUpdate: new Date() // Cập nhật thời gian cuối cùng
            });
            mainWindow.webContents.send("onDevicesState", deviceInfo);
          }, 1000);

        }
        else {
          deviceFind.status = 'online';
          await deviceFind.save();
          mainWindow.webContents.send("onDevicesState", deviceFind);
        };
        setTimeout(async () => {
          const port = await checkAndInstallApks(device.id, pathRoot);
          await checkAndInstallAtxAgent(device.id, pathRoot + "//app//atx-agent");
          let p = listDevice.find(c => c.device_id == device.id);
          if (!p) {
            listDevice.push({ device_id: device.id, port });
          }
          else {
            p.port = port;
          }
        }, 3000)

      })
      tracker.on('remove', async function (device) {
        await Device.update({ status: "offline" }, { where: { device_id: device.id } });
        mainWindow.webContents.send("onDevicesState", {device_id:device.id,status: 'offline'});
        listDevice = listDevice.filter(c => c.device_id != device.id);
      })
      tracker.on('end', function () {
        console.log('Tracking stopped')
      })
    })
    .catch(function (err) {
      console.error('Something went wrong:', err.stack)
    })
}