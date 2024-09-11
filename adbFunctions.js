const fs = require('fs');
const xpath = require('xpath');
const { DOMParser } = require('xmldom');
const Jimp = require('jimp');
const { createBuffer, getBufferData } = require('./createMessage');
const path = require('path');

async function sendMessageShell(ws, message) {
    return new Promise((resolve, reject) => {
        let dataSend = createBuffer(32, 1, getBufferData(message));

        ws.on('message', (data) => {

            if (message.includes('cat /sdcard/screenshot.png')) {
                // Nếu là lệnh ảnh, kiểm tra dữ liệu để xác định khi nào đã nhận toàn bộ dữ liệu
                if (data.toString().indexOf('a11q') > -1) {  // Thay đổi điều kiện kiểm tra nếu cần
                    ws.removeAllListeners();
                    setTimeout(() => {
                        resolve(data);  // Trả về buffer đầy đủ
                    }, 1000);
                }
            } else {
                // Nếu không phải là lệnh ảnh, kiểm tra dữ liệu để xác định khi nào đã nhận toàn bộ dữ liệu
                if (data.toString().indexOf('a11q') > -1) {  // Thay đổi điều kiện kiểm tra nếu cần
                    ws.removeAllListeners();
                    setTimeout(() => {
                        resolve(data.toString());  // Trả về chuỗi
                    }, 1000);
                }
            }
        });

        ws.send(dataSend);
        ws.send([0x20, 0x01, 0x00, 0x00, 0x00, 0x0d, 0x0a]);
    });
}

async function inStallApp(ws, apkPath) {
    await sendMessageShell(ws, `pm install ${apkPath}`);
}

function removeAllOccurrences(buffer, header) {
    const headerBuffer = Buffer.from(header);

    let offset = 0;
    let result = Buffer.alloc(0);

    while (offset < buffer.length) {
        // Tìm chỉ số đầu tiên của đoạn header trong buffer
        const index = buffer.indexOf(headerBuffer, offset);

        if (index === -1) {
            // Nếu không còn đoạn header nào, thêm phần còn lại của buffer vào kết quả
            result = Buffer.concat([result, buffer.slice(offset)]);
            break;
        }

        // Thêm phần buffer trước đoạn header vào kết quả
        result = Buffer.concat([result, buffer.slice(offset, index)]);
        // Cập nhật offset để bỏ qua đoạn header
        offset = index + headerBuffer.length;
    }

    return result;
}

async function screenShot(ws, options) {
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
        await sendMessageShell(ws, screenshotCommand);

        // Đợi một chút để thiết bị xử lý lệnh chụp màn hình
        await new Promise(resolve => setTimeout(resolve, 2000)); // Tăng thời gian chờ

        // Bước 2: Tải ảnh chụp màn hình về máy tính qua WebSocket
        const pullCommand = 'cat /sdcard/screenshot.png';
        const screenshotData = await sendMessageShell(ws, pullCommand);

        if (screenshotData) {
            // Nếu dữ liệu là chuỗi, chuyển đổi thành Buffer
            // const screenshotBuffer = Buffer.from(screenshotData, 'binary');
            console.log('Screenshot data:', screenshotData);
            
            // Đoạn byte cụ thể bạn muốn loại bỏ
            const headerToRemove = [0x20, 0x01, 0x00, 0x00, 0x00, 0x0d, 0x0a];

            // Loại bỏ đoạn byte cụ thể
            const cleanedData = removeAllOccurrences(screenshotData, headerToRemove);

            console.log('Cleaned data:', cleanedData);
            
            // Ghi dữ liệu ảnh vào tệp cục bộ
            fs.writeFileSync(localScreenshotPath, cleanedData);

            // Bước 3: Xóa ảnh chụp màn hình khỏi thiết bị sau khi đã tải về
            const removeCommand = 'rm /sdcard/screenshot.png';
            await sendMessageShell(ws, removeCommand);

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
                const screenshotBase64 = fs.readFileSync(localScreenshotPath, { encoding: 'base64' });
                return screenshotBase64; // Trả về base64 nếu cần
            } else {
                console.log(`Screenshot saved as ${localScreenshotPath}`);
            }
        } else {
            console.error('Failed to receive screenshot data.');
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
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
    console.log(`getAttribute: ${xpathQuery}, ${name}, ${seconds}`);

    const waitTime = seconds * 1000;

    await sendMessageShell(ws, `uiautomator dump /sdcard/ui.xml`);

    setTimeout(async () => {
        let result = await sendMessageShell(ws, `cat /sdcard/ui.xml`);

        result = result.substring(result.indexOf('<?xml'));

        fs.writeFileSync('ui.xml', result, 'utf8');

        // Kiểm tra sự tồn tại của tệp XML trước khi đọc
        if (fs.existsSync('ui.xml')) {
            // Đọc và phân tích tệp XML
            const data = fs.readFileSync('ui.xml', 'utf8');
            const doc = new DOMParser().parseFromString(data);
            const nodes = xpath.select(xpathQuery, doc);

            if (nodes.length > 0) {
                const node = nodes[0];
                const attributeValue = node.getAttribute(name);

                if (attributeValue) {
                    console.log(`Attribute found: ${attributeValue}`);
                    return attributeValue
                } else {
                    console.log('Attribute not found');
                }
            } else {
                console.log('Element not found');
            }
        } else {
            console.log('UI XML file does not exist');
        }

    }, waitTime);
}
async function elementExists(ws, xpathQuery, seconds = 10) {

    console.log(`ElementExists: ${xpathQuery}, ${seconds}`);

    await sendMessageShell(ws, `uiautomator dump /sdcard/ui.xml`);

    setTimeout(async () => {

        let result = await sendMessageShell(ws, `cat /sdcard/ui.xml`);

        result = result.substring(result.indexOf('<?xml'));

        fs.writeFileSync('ui.xml', result, 'utf8');

        if (fs.existsSync('ui.xml')) {
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
        }

    }, seconds * 1000);
}

async function adbShell(ws, command) {
    await sendMessageShell(ws, command);
}
async function generate2FA(ws, secretKey) {
    const token = speakeasy.totp({
        secret: secretKey,
        encoding: 'base32'
    });

    // Gửi mã 2FA qua WebSocket
    const message = `Generated 2FA token: ${token}`;
    await sendMessageShell(ws, message); // Gửi tin nhắn qua WebSocket

}

async function startApp(ws, packageName) {
    await sendMessageShell(ws, `monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`)
}
async function closeApp(ws, packageName) {
    await sendMessageShell(ws, `am force-stop ${packageName}`);
}

async function unInStallApp(ws, packageName) {
    await sendMessageShell(ws, `pm uninstall ${packageName}`);
}
async function isInStallApp(ws, packageName) {
    let isInstalled = await sendMessageShell(ws, `pm list packages | grep  ${packageName}`);

    if (isInstalled.includes(packageName)) {
        console.log(`${packageName} is installed.`);
    } else {
        console.log(`${packageName} is not installed.`);
    }
}
async function toggleAirplaneMode(ws) {
    let res = await sendMessageShell(ws, 'settings get global airplane_mode_on');

    res = res.substring(5).trim();

    // Kiểm tra xem phản hồi có chứa trạng thái chế độ máy bay không
    if (res.includes('0') || res.includes('1')) {

        const isAirplaneModeOn = res[0] === '1';

        // Dựa trên trạng thái hiện tại của chế độ máy bay, xác định lệnh bật/tắt
        const command = isAirplaneModeOn
            ? 'settings put global airplane_mode_on 0'  // Tắt chế độ máy bay
            : 'settings put global airplane_mode_on 1'; // Bật chế độ máy bay

        // Gửi lệnh bật/tắt chế độ máy bay qua WebSocket
        await sendMessageShell(ws, command);
    }

}
async function toggleWifi(ws) {
    let res = await sendMessageShell(ws, 'settings get global wifi_on');

    res = res.substring(5).trim();

    console.log("res => ", res);

    // Kiểm tra xem phản hồi có chứa trạng thái Wi-Fi không
    if (res.includes("0") || res.includes("1")) {

        const isWifiEnabled = res[0] === '1';

        // Dựa trên trạng thái hiện tại của Wi-Fi, xác định lệnh bật/tắt
        const command = isWifiEnabled
            ? 'svc wifi disable'  // Lệnh tắt Wi-Fi
            : 'svc wifi enable';  // Lệnh bật Wi-Fi

        // Gửi lệnh bật/tắt Wi-Fi qua WebSocket
        await sendMessageShell(ws, command);

    }

}
async function toggleData(ws) {
    let res = await sendMessageShell(ws, 'settings get global mobile_data');

    res = res.substring(5).trim();

    // Kiểm tra trạng thái của Mobile Data
    if (res.includes('0') || res.includes('1')) {
        console.log('Processing toggle');

        const isDataEnabled = res[0] === '1';

        // Dựa trên trạng thái hiện tại của Mobile Data, xác định lệnh bật/tắt
        const command = isDataEnabled
            ? 'svc data disable'  // Tắt Mobile Data
            : 'svc data enable';  // Bật Mobile Data

        // Gửi lệnh bật/tắt Mobile Data qua WebSocket
        await sendMessageShell(ws, command);

    }

}
async function toggleLocation(ws) {
    // Gửi lệnh kiểm tra trạng thái Location qua WebSocket
    let res = await sendMessageShell(ws, 'settings get secure location_mode');

    res = res.substring(5).trim();

    if (res.includes('0') || res.includes('1')) {

        const isLocationModeOn = res[0] === '1';

        const command = isLocationModeOn
            ? 'settings put secure location_mode 0'
            : 'settings put secure location_mode 1';

        await sendMessageShell(ws, command);
    }
}

async function toggleService(ws, service) {

    switch (service) {
        case 'AirplaneMode':
            toggleAirplaneMode(ws);
            break;
        case 'Wifi':
            toggleWifi(ws);
            break;
        case '3g/4g':
            toggleData(ws);
            break;
        case 'Location':
            toggleLocation(ws);
            break;
        default:
    }

}
async function transferFile(ws, action, localFilePath, remoteFilePath) {

    let command;

    if (action === 'push') {
        command = `push "${localFilePath}" "${remoteFilePath}"`;
    } else if (action === 'pull') {
        command = `pull "${remoteFilePath}" "${localFilePath}"`;
    }

    await sendMessageShell(ws, command);

}

async function touch(ws, xpathQuery, timeOut = 10, touchType = 'Normal', delay = 100) {
    console.log(`Touch: ${xpathQuery}, ${timeOut}, ${touchType}, ${delay}`);

    // Gửi lệnh để tạo bản dump của giao diện người dùng
    await sendMessageShell(ws, `uiautomator dump /sdcard/ui.xml`);

    // Đọc nội dung file XML
    let result = await sendMessageShell(ws, `cat /sdcard/ui.xml`);

    result = result.substring(result.indexOf('<?xml'));

    // Kiểm tra xem kết quả có phải là XML không
    if (result.startsWith('<?xml')) {
        fs.writeFileSync('ui.xml', result, 'utf8');

        // Đọc file XML và phân tích nó
        const data = fs.readFileSync('ui.xml', 'utf8');
        const doc = new DOMParser().parseFromString(data);
        const nodes = xpath.select(xpathQuery, doc);

        if (nodes.length > 0) {
            console.log(`Element found: ${nodes.length}`);

            const boundsAttr = nodes[0].getAttribute('bounds');
            const boundsRegex = /(\d+),(\d+)\]\[(\d+),(\d+)/;
            const match = boundsAttr.match(boundsRegex);

            if (match) {
                const [left, top, right, bottom] = match.slice(1).map(Number);
                const x = Math.floor((left + right) / 2);
                const y = Math.floor((top + bottom) / 2);

                const timeOutMilliseconds = timeOut * 1000;

                let touchCommand;
                switch (touchType) {
                    case 'Long':
                        touchCommand = `input swipe ${x} ${y} ${x} ${y} ${timeOutMilliseconds}`;
                        break;
                    case 'Double':
                        touchCommand = `input tap ${x} ${y} && input tap ${x} ${y}`;
                        break;
                    default:
                        touchCommand = `input tap ${x} ${y}`;
                        break;
                }

                // Gửi lệnh chạm sau một khoảng thời gian trễ (nếu có)
                if (delay > 0) {
                    setTimeout(() => {
                        sendMessageShell(ws, touchCommand);
                    }, delay);
                } else {
                    await sendMessageShell(ws, touchCommand);
                }
            }
        } else {
            console.log("Element not found for the given XPath.");
        }
    } else {
        console.log("Invalid XML format.");
    }
}

// async function screenShot(event, options) {

//     const screenshotName = options.fileName || 'screenshot.png';
//     const outputFolder = options.folderOutput || '.';
//     const localScreenshotPath = path.join(outputFolder, screenshotName);

//     // Kiểm tra thư mục đích và tạo nếu cần
//     if (!fs.existsSync(outputFolder)) {
//         fs.mkdirSync(outputFolder, { recursive: true });
//     }

//     const crop = options.crop || false;
//     const outputVariable = options.outputVariable || null;
//     const startX = options.startX || 0;
//     const startY = options.startY || 0;
//     const endX = options.endX || 0;
//     const endY = options.endY || 0;

//     try {
//         // Bước 1: Gửi lệnh chụp màn hình qua WebSocket
//         const screenshotCommand = 'screencap -p /sdcard/screenshot.png';
//         sendMessageShell(screenshotCommand);

//         // Đợi một chút để thiết bị xử lý lệnh chụp màn hình
//         await new Promise(resolve => setTimeout(resolve, 2000));

//         // Bước 2: Tải ảnh chụp màn hình về máy tính
//         console.log('Pulling screenshot...');
//         // Sử dụng dấu gạch chéo cho đường dẫn trên Windows
//         const pullCommand = `adb pull /sdcard/screenshot.png "${localScreenshotPath.replace(/\\/g, '/')}"`;
//         execSync(pullCommand);

//         // Bước 3: Xóa ảnh chụp màn hình khỏi thiết bị sau khi đã tải về
//         const removeCommand = 'rm /sdcard/screenshot.png';
//         sendMessageShell(removeCommand);

//         // Bước 4: Xử lý cắt ảnh nếu được yêu cầu
//         if (crop) {
//             console.log('Cropping screenshot...');
//             const image = await Jimp.read(localScreenshotPath);
//             const width = endX - startX;
//             const height = endY - startY;
//             await image
//                 .crop(startX, startY, width, height)
//                 .writeAsync(localScreenshotPath.replace('.png', '_cropped.png'));
//         }

//         // Bước 5: Xuất ảnh dưới dạng base64 nếu yêu cầu
//         if (outputVariable) {
//             const screenshotData = fs.readFileSync(localScreenshotPath, { encoding: 'base64' });
//             event.reply('screenshot-reply', { base64: screenshotData });
//         } else {
//             event.reply('screenshot-reply', `Screenshot saved as ${localScreenshotPath}`);
//         }
//     } catch (error) {
//         console.error(`Error: ${error.message}`);
//         event.reply('screenshot-reply', `Error: ${error.message}`);
//     }
// }

async function swipeSimple(ws, direction) {

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
    }

    await sendMessageShell(ws, `input swipe ${startX} ${startY} ${endX} ${endY}`);

}
async function swipeCustom(ws, startX, startY, endX, endY, duration) {
    await sendMessageShell(ws, `input swipe ${startX} ${startY} ${endX} ${endY} ${duration}`);
}

async function pressKey(ws, keyCode) {
    await sendMessageShell(ws, `input keyevent ${keyCode}`);
}

async function typeText(ws, selector, seconds = 10, text) {
    console.log(`Selector: ${selector}, Duration: ${seconds}, Text: ${text}`);

    await sendMessageShell(ws, 'uiautomator dump /sdcard/ui.xml');

    setTimeout(async () => {

        let result = await sendMessageShell(ws, `cat /sdcard/ui.xml`);

        result = result.substring(result.indexOf('<?xml'));

        fs.writeFileSync('ui.xml', result, 'utf8');

        // Kiểm tra sự tồn tại của tệp XML trước khi đọc
        if (fs.existsSync('ui.xml')) {

            const data = fs.readFileSync('ui.xml', 'utf8');
            const doc = new DOMParser().parseFromString(data, 'text/xml');
            const nodes = xpath.select(selector, doc);

            // // Bước 2: Đọc và phân tích tệp XML để lấy tọa độ của trường nhập liệu
            // const data = fs.readFileSync('ui.xml', 'utf8');
            // const doc = new DOMParser().parseFromString(data, 'text/xml');
            // const nodes = xpath.select(selector, doc);

            if (nodes.length > 0) {
                const node = nodes[0];
                const boundsAttr = node.getAttribute('bounds');

                if (!boundsAttr) {
                    console.log('No bounds attribute found for the element');
                    return;
                }

                const boundsRegex = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/;
                const match = boundsAttr.match(boundsRegex);

                if (match) {
                    const [left, top, right, bottom] = match.slice(1).map(Number);
                    const x = Math.floor((left + right) / 2);
                    const y = Math.floor((top + bottom) / 2);

                    // Bước 3: Nhấp vào trường để chọn nó
                    console.log(`Tapping on (${x}, ${y})...`);
                    await sendMessageShell(ws, `input tap ${x} ${y}`);

                    // Bước 4: Nhập văn bản vào trường
                    const escapedText = text.replace(/ /g, '%s'); // Escape space characters
                    const typeCommand = `input text "${escapedText}"`;

                    console.log(`Executing command: ${typeCommand}`);
                    await sendMessageShell(ws, typeCommand);

                } else {
                    console.log('Invalid bounds attribute format');
                }
            }
        }
    }, seconds * 1000);

}

module.exports = {
    startApp,
    closeApp,
    pressBack,
    pressHome,
    pressMenu,
    getAttribute,
    inStallApp,
    unInStallApp,
    isInStallApp,
    deviceActions,
    toggleService,
    transferFile,
    touch,
    swipeSimple,
    swipeCustom,
    screenShot,
    pressKey,
    typeText,
    // getDeviceList,
    // connectWebSocket,
    // deviceManager,
    // getDevices,
    // deleteDevices,
    adbShell,
    generate2FA,
    elementExists,
    getAttribute
}  