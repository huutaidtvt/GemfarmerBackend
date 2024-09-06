const { createBuffer, getBufferData } = require('./createMessage')
async function sendMessageShell(ws, message) {
    return new Promise((resolve, reject) => {
    
        let dataSend = createBuffer(32, 1, getBufferData(message));
        ws.on('message', (data) => {
            if (data.toString().indexOf('on5xelte') > -1) {
                ws.removeAllListeners();
                setTimeout(() => {
                    resolve(data.toString());
                }, 1000)

            }
        })
        ws.send(dataSend);
        ws.send([0x20, 0x01, 0x00, 0x00, 0x00, 0x0d, 0x0a]);
    })

}
async function pressBack(ws) {
    await sendMessageShell(ws, "input keyevent 4");
}
async function pressHome(ws) {
    await sendMessageShell(ws, "input keyevent 3");
}
async function pressMenu(ws) {
    await sendMessageShell(ws, "input keyevent 187");
}
async function lockPhone(ws) {

    await sendMessageShell(ws, "input keyevent 26")
}
async function unlockPhone(ws) {

    await sendMessageShell(ws, "input keyevent 82");
}
async function deviceActions(ws, action) {

    switch (action) {

        case 'unlock':
            await unlockPhone(ws);
            break;
        default:
            await lockPhone(ws);
            break;
    }

}
async function getAttribute(ws, xpathQuery, name, seconds) {
    const waitTime = seconds * 1000;

    await sendMessageShell(ws,`uiautomator dump /sdcard/ui.xml`);
    let result=await sendMessageShell(ws,`cat /sdcard/ui.xml`);
    console.log(result);

    // setTimeout(() => {
    //     // Sao chép tệp XML từ thiết bị Android về máy tính
    //     execSync(`adb pull /sdcard/ui.xml .`);

    //     // Kiểm tra sự tồn tại của tệp XML trước khi đọc
    //     if (fs.existsSync('ui.xml')) {
    //         // Đọc và phân tích tệp XML
    //         const data = fs.readFileSync('ui.xml', 'utf8');
    //         const doc = new DOMParser().parseFromString(data);
    //         const nodes = xpath.select(xpathQuery, doc);

    //         if (nodes.length > 0) {
    //             const node = nodes[0];
    //             const attributeValue = node.getAttribute(name);

    //             if (attributeValue) {
    //                 console.log(`Attribute found: ${attributeValue}`);
    //                 event.reply('attribute-reply', `Attribute found: ${attributeValue}`);
    //             } else {
    //                 console.log('Attribute not found');
    //                 event.reply('attribute-reply', 'Attribute not found');
    //             }
    //         } else {
    //             console.log('Element not found');
    //             event.reply('attribute-reply', 'Element not found');
    //         }
    //     } else {
    //         console.log('UI XML file does not exist');
    //         event.reply('attribute-reply', 'UI XML file does not exist');
    //     }

    // }, waitTime);
}


async function ElementExists(event, xpathQuery, seconds = 10) {
    console.log(`ElementExists: ${xpathQuery}, ${seconds}`);

    await sendMessageShell(`uiautomator dump /sdcard/ui.xml`);

    setTimeout(() => {
        execSync(`adb pull /sdcard/ui.xml .`);

        // Bước 2: Đọc và phân tích tệp XML để lấy tọa độ từ XPath
        const data = fs.readFileSync('ui.xml', 'utf8');
        const doc = new DOMParser().parseFromString(data);
        const nodes = xpath.select(xpathQuery, doc);

        if (nodes.length > 0) {
            console.log(`Element found: ${nodes.length}`);
            return true
        } else {
            console.log('Element not found');
            return false
        }

    }, seconds * 1000);
}

function adbShell(event, command) {
    sendMessageShell(command);
}
function generate2FA(event, secretKey) {
    const token = speakeasy.totp({
        secret: secretKey,
        encoding: 'base32'
    });

    // Gửi mã 2FA qua WebSocket
    const message = `Generated 2FA token: ${token}`;
    sendMessageShell(message); // Gửi tin nhắn qua WebSocket

    console.log(message);
}

function startApp(event, packageName) {
    sendMessageShell(`monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`)
}
function closeApp(event, packageName) {
    sendMessageShell(`am force-stop ${packageName}`);
}
function inStallApp(event, apkPath) {
    sendMessageShell(`install ${apkPath}`);
}
function unInStallApp(event, packageName) {
    sendMessageShell(`uninstall ${packageName}`);
}
function isInStallApp(event, packageName) {
    sendMessageShell(`pm list packages | findstr ${packageName}`);
}
function toggleAirplaneMode(event) {
    sendMessageShell('settings get global airplane_mode_on');

    let airplaneModeToggled = false;
    // Lắng nghe phản hồi từ WebSocket
    ws.on('message', function (data) {

        if (airplaneModeToggled) return;  // Nếu không xử lý báo cáo chê độ máy bay, không xử lý thểm

        // Chuyển đổi dữ liệu thành chuỗi và loại bỏ các ký tự không cần thiết
        const message = data.toString().substring(5);
        console.log(`Received message: ${message}`);

        // Kiểm tra xem phản hồi có chứa trạng thái chế độ máy bay không
        if (message.includes('0') || message.includes('1')) {

            const isAirplaneModeOn = message[0] == '1';

            // Dựa trên trạng thái hiện tại của chế độ máy bay, xác định lệnh bật/tắt
            const command = isAirplaneModeOn
                ? 'settings put global airplane_mode_on 0'  // Tắt chế độ máy bay
                : 'settings put global airplane_mode_on 1'; // Bật chế độ máy bay

            // Gửi lệnh bật/tắt chế độ máy bay qua WebSocket
            sendMessageShell(command);

            airplaneModeToggled = true;

        }

    });
}
function toggleWifi(event) {
    sendMessageShell('dumpsys wifi');

    // Cờ để ngăn chặn việc xử lý phản hồi nhiều lần
    let wifiToggled = false;

    // Xử lý phản hồi từ WebSocket
    ws.on('message', function (data) {
        if (wifiToggled) return;  // Nếu đã xử lý bật/tắt Wi-Fi, không xử lý thêm

        // Chuyển đổi dữ liệu thành chuỗi và loại bỏ các ký tự không cần thiết
        data = data.toString().substring(5);

        // Kiểm tra xem phản hồi có chứa trạng thái Wi-Fi không
        if (data.includes("Wi-Fi is enabled") || data.includes("Wi-Fi is disabled")) {
            const isWifiEnabled = data.includes("Wi-Fi is enabled");

            // Dựa trên trạng thái hiện tại của Wi-Fi, xác định lệnh bật/tắt
            const command = isWifiEnabled
                ? 'svc wifi disable'  // Lệnh tắt Wi-Fi
                : 'svc wifi enable';  // Lệnh bật Wi-Fi

            // Gửi lệnh bật/tắt Wi-Fi qua WebSocket
            sendMessageShell(command);

            // Đặt cờ để ngăn xử lý lại
            wifiToggled = true;

            // Gửi phản hồi về kết quả bật/tắt Wi-Fi
            const action = isWifiEnabled ? 'Wi-Fi disabled' : 'Wi-Fi enabled';
            event.reply('service-toggle-reply', `${action} successfully.`);
        }
    });
}
function toggleData(event) {
    sendMessageShell('settings get global mobile_data');

    // Cờ để ngăn chặn việc xử lý phản hồi nhiều lần
    let dataToggled = false;

    // Lắng nghe phản hồi từ WebSocket
    ws.on('message', function (data) {

        if (dataToggled) return;  // Nếu đã xử lý Mobile Data, không xử lý thêm

        // Chuyển đổi dữ liệu thành chuỗi và loại bỏ các ký tự không cần thiết
        const message = data.toString().substring(5);

        console.log(`Received message: ${message}`);

        // Kiểm tra trạng thái của Mobile Data
        if (message.includes('0') || message.includes('1')) {
            console.log('Processing toggle');

            const isDataEnabled = message[0] === '1';

            // Dựa trên trạng thái hiện tại của Mobile Data, xác định lệnh bật/tắt
            const command = isDataEnabled
                ? 'svc data disable'  // Tắt Mobile Data
                : 'svc data enable';  // Bật Mobile Data

            // Gửi lệnh bật/tắt Mobile Data qua WebSocket
            sendMessageShell(command);

            // Đặt cờ để ngăn xử lý lại
            dataToggled = true;

        }
    });
}
function toggleLocation(event) {
       // Gửi lệnh kiểm tra trạng thái Location qua WebSocket
       sendMessageShell('settings get secure location_mode');

       // Cờ để ngăn chặn việc xử lý phản hồi nhiều lần
       let locationToggled = false;
   
       // Lắng nghe phản hồi từ WebSocket
       ws.on('message', function (data) {
   
           if (locationToggled) return;  // Nếu đã xử lý Location, không xử lý thêm
   
           // Chuyển đổi dữ liệu thành chuỗi và loại bỏ các ký tự không cần thiết
           const message = data.toString().substring(5);
   
   
           if (message.includes('0') || message.includes('1')) {
   
               const isLocationModeOn = message[0] == '1';
   
   
               const command = isLocationModeOn
                   ? 'settings put secure location_mode 0'
                   : 'settings put secure location_mode 1';
   
   
               sendMessageShell(command);
   
               locationToggled = true;
   
           }
       });
}
function toggleService(event, service) {
    console.log(service);

    switch (service) {
        case 'AirplaneMode':
            toggleAirplaneMode(event);
            break;
        case 'Wifi':
            toggleWifi(event);
            break;
        case '3g/4g':
            toggleData(event);
            break;
        case 'Location':
            toggleLocation(event);
            break;
        default:
            event.reply('service-toggle-reply', 'Unknown action');
            break;
    }

}
function transferFile(event, action, localFilePath, remoteFilePath) {
    
    let command;
    if (action === 'push') {
        command = `push "${localFilePath}" "${remoteFilePath}"`;
    } else if (action === 'pull') {
        command = `pull "${remoteFilePath}" "${localFilePath}"`;
    } else {
        event.reply('file-transfer-reply', `Unknown action: ${action}`);
        return;
    }

    sendMessageShell(command);

}
async function touch(event, xpathQuery, timeOut = 10, touchType = 'Normal', delay = 100) {
    console.log(`Touch: ${xpathQuery}, ${timeOut}, ${touchType}, ${delay}`);

    try {
        await sendMessageShell(`uiautomator dump /sdcard/ui.xml`);

        execSync(`adb pull /sdcard/ui.xml .`);

        // Bước 2: Đọc và phân tích tệp XML để lấy tọa độ từ XPath
        const data = fs.readFileSync('ui.xml', 'utf8');
        const doc = new DOMParser().parseFromString(data);
        const nodes = xpath.select(xpathQuery, doc);

        if (nodes.length > 0) {
            const boundsAttr = nodes[0].getAttribute('bounds');
            const boundsRegex = /(\d+),(\d+)\]\[(\d+),(\d+)/;
            const match = boundsAttr.match(boundsRegex);

            if (match) {
                const [left, top, right, bottom] = match.slice(1).map(Number);
                const x = Math.floor((left + right) / 2);
                const y = Math.floor((top + bottom) / 2);

                const timeOutMilliseconds = timeOut * 1000;

                // Bước 3: Thực hiện lệnh chạm dựa trên loại chạm
                let touchCommand;
                switch (touchType) {
                    case 'Long':
                        // Chạm giữ lâu bằng cách sử dụng swipe với cùng tọa độ và thời gian giữ lâu
                        touchCommand = `input swipe ${x} ${y} ${x} ${y} ${timeOutMilliseconds}`;
                        break;
                    case 'Double':
                        // Chạm hai lần bằng cách sử dụng tap hai lần với khoảng cách ngắn
                        touchCommand = `input tap ${x} ${y} && input tap ${x} ${y}`;
                        break;
                    default:
                        // Chạm bình thường
                        touchCommand = `input tap ${x} ${y}`;
                        break;
                }

                if (delay > 0) {
                    setTimeout(() => {
                        sendMessageShell(touchCommand);
                        event.reply('touch-reply', `Element touched at (${x}, ${y})`);
                    }, delay);
                } else {
                    sendMessageShell(touchCommand);
                    event.reply('touch-reply', `Element touched at (${x}, ${y})`);
                }

            } else {
                event.reply('touch-reply', 'No bounds attribute found for the element');
            }
        } else {
            event.reply('touch-reply', 'No element found for the XPath query');
        }
    } catch (error) {
        event.reply('touch-reply', `Error: ${error.message}`);
    }


}

async function screenShot(event, options) {
    console.log('Options:', options);

    const screenshotName = options.fileName || 'screenshot.png';
    const outputFolder = options.folderOutput || '.';
    const localScreenshotPath = path.join(outputFolder, screenshotName);

    // Kiểm tra thư mục đích và tạo nếu cần
    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
    }

    const crop = options.crop || false;
    const outputVariable = options.outputVariable || null;
    const startX = options.startX || 0;
    const startY = options.startY || 0;
    const endX = options.endX || 0;
    const endY = options.endY || 0;

    try {
        // Bước 1: Gửi lệnh chụp màn hình qua WebSocket
        const screenshotCommand = 'screencap -p /sdcard/screenshot.png';
        sendMessageShell(screenshotCommand);

        // Đợi một chút để thiết bị xử lý lệnh chụp màn hình
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Bước 2: Tải ảnh chụp màn hình về máy tính
        console.log('Pulling screenshot...');
        // Sử dụng dấu gạch chéo cho đường dẫn trên Windows
        const pullCommand = `adb pull /sdcard/screenshot.png "${localScreenshotPath.replace(/\\/g, '/')}"`;
        execSync(pullCommand);

        // Bước 3: Xóa ảnh chụp màn hình khỏi thiết bị sau khi đã tải về
        const removeCommand = 'rm /sdcard/screenshot.png';
        sendMessageShell(removeCommand);

        // Bước 4: Xử lý cắt ảnh nếu được yêu cầu
        if (crop) {
            console.log('Cropping screenshot...');
            const image = await Jimp.read(localScreenshotPath);
            const width = endX - startX;
            const height = endY - startY;
            await image
                .crop(startX, startY, width, height)
                .writeAsync(localScreenshotPath.replace('.png', '_cropped.png'));
        }

        // Bước 5: Xuất ảnh dưới dạng base64 nếu yêu cầu
        if (outputVariable) {
            const screenshotData = fs.readFileSync(localScreenshotPath, { encoding: 'base64' });
            event.reply('screenshot-reply', { base64: screenshotData });
        } else {
            event.reply('screenshot-reply', `Screenshot saved as ${localScreenshotPath}`);
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        event.reply('screenshot-reply', `Error: ${error.message}`);
    }
}
function swipeSimple(event, direction) {
    console.log('Direction:', direction);

    // Đường dẫn đầy đủ tới adb
    // const adbPath = `"C:/Users/MY ASUS/AppData/Local/Android/Sdk/platform-tools/adb.exe"`; 

    // Kiểm tra tham số
    if (!direction) {
        event.reply('swipe-reply', 'Lỗi: Thiếu tùy chọn Direction');
        return;
    }

    // Xác định tọa độ swipe dựa trên direction
    let startX, startY, endX, endY;

    switch (direction) {
        case 'Up':
            startX = 500;
            startY = 1000;
            endX = 500;
            endY = 200;
            break;
        case 'Down':
            startX = 500;
            startY = 300;
            endX = 500;
            endY = 800;
            break;
        case 'Left':
            startX = 600;
            startY = 500;
            endX = 300;
            endY = 500;
            break;
        case 'Right':
            startX = 200;
            startY = 500;
            endX = 1000;
            endY = 500;
            break;
        default:
            event.reply('swipe-reply', 'Lỗi: Direction không hợp lệ');
            return;
    }

    console.log(`Start: (${startX}, ${startY}), End: (${endX}, ${endY})`);

    sendMessageShell(`input swipe ${startX} ${startY} ${endX} ${endY}`);

    // Xây dựng lệnh swipe
    // const swipeCommand = `${adbPath} shell input swipe ${startX} ${startY} ${endX} ${endY}`;
    // console.log(`Đang thực hiện lệnh: ${swipeCommand}`); // Dòng debug

    // try {
    //     // Thực thi lệnh swipe
    //     const stdout = execSync(swipeCommand).toString();
    //     console.log(`Đầu ra của lệnh: ${stdout}`); // Dòng debug

    //     event.reply('swipe-reply', 'Swipe/Scroll đã được thực hiện thành công');
    // } catch (error) {
    //     console.error(`Lỗi khi thực hiện lệnh: ${error.message}`);
    //     event.reply('swipe-reply', `Lỗi: ${error.message}`);
    // }
}
function swipeCustom(event, startX, startY, endX, endY, duration) {
}
function pressKey(event, keyCode) {
}

async function typeText(event, selector, seconds = 10, text) {
}
module.exports = {
    // startApp,
    // closeApp,
    pressBack,
    pressHome,
    pressMenu,
    getAttribute,
    // inStallApp,
    // unInStallApp,
    // isInStallApp,
    deviceActions,
    // toggleService,
    // transferFile,
    // touch,
    // swipeSimple,
    // swipeCustom,
    // screenShot,
    // pressKey,
    // typeText,
    // getDeviceList,
    // connectWebSocket,
    // deviceManager,
    // getDevices,
    // deleteDevices,
    // adbShell,
    // generate2FA,
    // ElementExists,
    // getAttribute
}  