const { app, BrowserWindow, session, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const license = require('./license');
const { spawn, exec } = require('node:child_process');
var splashWindow = null;
var mainWindow = null;
let deviceValid;
let deviceCode;
const pathWeb = path.join("D:\\genlogin\\farmer\\gemfarmer", "build");
const pathPreload = path.join(__dirname, 'preload.js');
const osPaths = require('os-paths/cjs');
const pathRoot = osPaths.home() + "\\.gemFamer";
const WebSocket = require('ws');
let download = require('./download');
const { Sequelize, where, Op } = require('sequelize');
const sequelize = require('./configs/database');
const Scripts = require('./models/Script');
const Device = require('./models/Device');
const { startScrcpy, stopScrcpy } = require('./scrcpy');
const { createBuffer, getChannelInitData, getBufferData } = require('./createMessage')
const { pressBack, pressHome, pressMenu,deviceActions ,getAttribute} = require('./adbFunctions')
var listDevice = [];
const ChannelCode = {
  FSLS: 'FSLS', // File System LiSt
  HSTS: 'HSTS', // HoSTS List
  SHEL: 'SHEL', // SHELl
  GTRC: 'GTRC', // Goog device TRaCer
  ATRC: 'ATRC', // Appl device TRaCer
  WDAP: 'WDAP', // WebDriverAgent Proxy
  QVHS: 'QVHS', // Quicktime_Video_Hack Stream
}
async function createWindow() {
  session.defaultSession.loadExtension(pathWeb).then((data) => {
    mainWindow.loadURL(data.url + "/newtab.html#");
  });
  //startScrcpy();
  sequelize.sync()
  createSplashWindow();
  // let checkRun = await isRunning("gemLogin.exe");
  // if (checkRun) {
  //   exec(`taskkill /im gemLogin.exe /f`, (err, stdout, stderr) => {
  //   })
  // }

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
  ipcMain.handle("sendData", async (event, data) => {
    console.log(data)
    const deviceId = data.deviceId;
    let device = listDevice.find(c => c.deviceId == deviceId);
    let client;
    if (!device) {
      client=await createConnect(deviceId);
      listDevice.push({ deviceId, client })
    }
    else {
      client = device.client;
    }
    getAttribute(client,"","","","")
    // switch (data.type) {
    //   case "pressMenu": {
    //    await pressMenu(client);
    //     return { success: true, message: "success" }
    //   }
    //   case "pressHome": {
    //     await  pressHome(client);
    //     return { success: true, message: "success" }
    //   }
    //   case "pressBack": {
    //     await pressBack(client);
    //     return { success: true, message: "success" }
    //   }
    //   case "deviceAction":{
    //     await deviceActions(client,data.data.action);
    //     return { success: true, message: "success" }

    //   }
    // }
    console.log(data);
  })
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
  ipcMain.handle("initLaucher", async () => {
    {
      await sequelize.sync();
      connectWebSocket(mainWindow);
      initLaucher();
    }
  })
  ipcMain.handle('quitAndInstall', () => {
    try {
      if (fs.existsSync(`${pathRoot}\\update\\setup.exe`)) {
        exec(`setup.exe`, { cwd: `${pathRoot}\\update` }, (err, stdout, stderr) => {
          console.log(err);
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
    console.log(data);
    let result = await getDevices();
    console.log(result)
    return { success: true, message: "success", data: result };
  })
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
      opacity :0.5,
      //images: true,
      center: true,
      'alwaysOnTop': true,
      'skipTaskbar': true,
      'useContentSize': true
    });
    splashWindow.loadURL('http://localhost:8000/#!action=stream&udid=42007fb2ce75c379&player=tinyh264&ws=ws%3A%2F%2Flocalhost%3A8000%2F%3Faction%3Dproxy-adb%26remote%3Dtcp%253A8886%26udid%3D42007fb2ce75c379');
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
function connectWebSocket(win) {
  let ws = new WebSocket('ws://localhost:8000/?action=multiplex');
  ws.on('error', console.error);
  ws.on('open', function open() {
    let message = createBuffer(4, 1, getChannelInitData(ChannelCode.GTRC));
    ws.send(message);
  });

  ws.on('message', async function message(data) {
    try {
      data = data.toString().substring(5);
      console.log(data);
      // Chuyển đổi dữ liệu nhận được từ WebSocket thành chuỗi và phân tích nó
      const jsonData = JSON.parse(data);

      if (jsonData.type === 'devicelist') {

        const devices = jsonData.data.list;

        // Lấy danh sách UDID của thiết bị mới
        const deviceIds = devices.map(device => device.udid);

        // Cập nhật hoặc thêm thiết bị vào cơ sở dữ liệu
        for (const device of devices) {
          let name = device['ro.product.model'];
          let manufacturer = device['ro.product.manufacturer'];
          let version = device["ro.build.version.release"];
          const { udid, state, ...rest } = device;
          await Device.upsert({
            name: name,
            version: version,
            manufacturer: manufacturer,
            device_id: udid, // Sử dụng `udid` làm `name` để đảm bảo tính duy nhất
            status: state === 'device' ? 'online' : 'offline', // Cập nhật trạng thái thiết bị
            ...rest, // Thêm các trường khác nếu cần thiết
            lastUpdate: new Date() // Cập nhật thời gian cuối cùng
          });
        }
        // Lấy danh sách thiết bị hiện tại từ cơ sở dữ liệu
        const allDevices = await Device.findAll();
        const currentDeviceIds = allDevices.map(device => device.name); // Sử dụng `name` vì `id` là UDID

        // Xác định các thiết bị đã không còn trong danh sách mới
        const offlineDevices = currentDeviceIds.filter(id => !deviceIds.includes(id));

        // Cập nhật trạng thái của các thiết bị không còn trong danh sách mới
        if (offlineDevices.length > 0) {
          await Device.update(
            { status: 'offline' },
            { where: { name: offlineDevices } } // Sử dụng `name` vì `id` là UDID
          );
        }
      }
      if (jsonData.type == "device") {
        const deviceId = jsonData.data.device.udid;
        if (jsonData.data.device.state == "offline") {
          await Device.update(
            { status: 'offline' },
            { where: { name: deviceId } } // Sử dụng `name` vì `id` là UDID
          );
        }
        else {
          await Device.update(
            { status: 'online' },
            { where: { name: deviceId } } // Sử dụng `name` vì `id` là UDID
          );
        }
        if (win) {
          console.log('Updating device list in main window...');
          let deviceList = await getDevices();
          win.webContents.send('update-device-list', deviceList);
        }

      }

    } catch (error) {
      console.error('Error processing device list:', error);
    }
  });

  ws.on('close', function close() {
    console.log('Connection closed');
  });
}
async function getDevices() {
  try {
    const devices = await Device.findAll({ raw: true });
    return devices
  } catch (error) {
    console.error('Error retrieving device list:', error);
    return [];
  }
}
async function createConnect(deviceId) {
  return new Promise((resolve, reject) => {
    let timeOut = setTimeout(() => { reject() }, 10000)
    let client = new WebSocket('ws://localhost:8000/?action=multiplex');
    client.on("open", () => {
      let message = createBuffer(4, 1, getChannelInitData(ChannelCode.SHEL));
      client.send(message);
      let data = {
        id: 1,
        type: 'shell',
        data: {
          type: 'start',
          rows: 37,
          cols: 51,
          udid: deviceId,
        },
      };

      message = createBuffer(32, 1, getBufferData(JSON.stringify(data)));
      client.send(message);
      clearTimeout(timeOut);
      resolve(client)
    })
  })
}