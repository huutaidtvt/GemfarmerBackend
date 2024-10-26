const fs = require('fs');
const xpath = require('xpath');
const { DOMParser } = require('xmldom');
const Jimp = require('jimp');
const { createBuffer, getBufferData } = require('./createMessage');
const path = require('path');
const speakeasy = require('speakeasy');
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const adbPath = 'adb'//path.join(__dirname, "adbTool/adb.exe")
const { spawn } = require('child_process');
const { error } = require('console');
const fetch = require('node-fetch');
const adb = require('adbkit');
const client = adb.createClient();

function closeConnectionAfterTimeout(connection, timeout) {
    setTimeout(() => connection.end(), timeout * 1000);
}
async function imapReadMail(
    service,
    email,
    password,
    mailbox = 'INBOX',
    options = {
        unseen: true,
        markAsRead: false,
        latestMail: true,
        from: '',
        to: '',
        subject: '',
        body: '',
        minutesAgo: 0,
        flags: { g: false, i: false, m: false }
    },
    contentContains = '',
    timeout = 30,
    imapHost = 'imap.gmail.com',
    imapPort = 993,
    tlsSecure = true
) {

    let host, port, tls;
    switch (service.toLowerCase()) {
        case 'gmail':
            host = 'imap.gmail.com';
            port = 993;
            tls = true;
            break;
        case 'outlook':
        case 'hotmail':
            host = 'imap-mail.outlook.com';
            port = 993;
            tls = true;
            break;
        case 'yahoo':
            host = 'imap.mail.yahoo.com';
            port = 993;
            tls = true;
            break;
        case 'custom':
            host = imapHost;
            port = imapPort;
            tls = tlsSecure;
            break;
        default:
            throw new Error('Unsupported email service');
    }

    const config = {
        imap: {
            user: email,
            password: password,
            host: host,
            port: port,
            tls: tls,
            tlsOptions: {
                rejectUnauthorized: false  // Bỏ qua kiểm tra chứng chỉ tự ký
            },
            authTimeout: 3000,
        }
    };

    try {
        // Kết nối tới server IMAP
        const connection = await imaps.connect(config);
        await connection.openBox(mailbox);

        // Tùy chọn tìm email
        const searchCriteria = [];
        if (options.unseen) searchCriteria.push('UNSEEN');

        // Nếu latestMail = false, lọc theo điều kiện khác
        if (!options.latestMail) {

            if (options.minutesAgo) {
                const dateFrom = new Date(Date.now() - options.minutesAgo * 60 * 1000);
                searchCriteria.push(['SINCE', dateFrom]);
            }
            if (options.from) searchCriteria.push(['FROM', options.from]);
            if (options.to) searchCriteria.push(['TO', options.to]);
            if (options.subject) searchCriteria.push(['SUBJECT', options.subject]);
            if (options.body) {
                // `BODY` tìm kiếm trong nội dung email
                searchCriteria.push(['BODY', options.body]);
            }
        } else {
            searchCriteria.push(['SINCE', new Date()]);
        }

        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: options.markAsRead
        };

        // Lấy email từ mailbox
        const messages = await connection.search(searchCriteria, fetchOptions);

        if (messages.length > 0) {
            // Sắp xếp email theo ngày gửi
            messages.sort((a, b) => b.attributes.date - a.attributes.date);

            let selectedMessages = options.latestMail ? [messages[0]] : messages; // Đảm bảo luôn là một mảng

            let result = [];

            for (let message of selectedMessages) {
                const all = message.parts.find(part => part.which === '');
                if (!all) throw new Error('Email body not found');

                const id = message.attributes.uid;
                const idHeader = `Imap-Id: ${id}\r\n`;

                const parsed = await simpleParser(idHeader + all.body);

                // Xử lý nội dung email: loại bỏ các ký tự xuống dòng và khoảng trắng không cần thiết
                const cleanContent = parsed.text.replace(/\r?\n|\r/g, ' ').trim();

                const emailDetails = {
                    from: parsed.from.text,
                    to: parsed.to ? parsed.to.text : '',
                    subject: parsed.subject,
                    content: cleanContent
                };

                // Nếu có `contentContains` và khớp, thêm trường `extractedData`
                if (contentContains && parsed.text) {
                    // Xây dựng chuỗi flag từ lựa chọn của người dùng
                    let flags = '';
                    if (options.flags.g) flags += 'g';
                    if (options.flags.i) flags += 'i';
                    if (options.flags.m) flags += 'm';

                    const regex = new RegExp(contentContains, flags); // Sử dụng các flag đã chọn

                    const match = parsed.text.match(regex);

                    if (match) {
                        // Nếu có nhiều kết quả, trả về mảng các kết quả khớp
                        emailDetails.extractedData = match.length > 1 ? match : [match[0]];
                    } else {
                        // Nếu không có kết quả khớp
                        emailDetails.extractedData = null;
                    }
                }

                result.push(emailDetails);
            }

            closeConnectionAfterTimeout(connection, timeout);

            console.log('Email log:', result);

            // Trả về email mới nhất hoặc danh sách email
            return options.latestMail ? result[0] : result;
        }

        closeConnectionAfterTimeout(connection, timeout);

        console.log('No emails found');
        return null;

    } catch (error) {
        console.error('Error reading emails:', error);
        return null;
    }
}

function actionFile(action, filePath, inputData = "", selectorType, writeMode, appendMode, delimiter = ',') {
    // Chuẩn hóa đường dẫn file
    const fullPath = path.resolve(filePath);

    if (action === 'Delete') {
        // Xóa file
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`File deleted: ${fullPath}`);
        } else {
            console.log(`File not found: ${fullPath}`);
        }
    } else if (action === 'Write') {
        let dataToWrite = '';

        if (selectorType === 'txt') {
            dataToWrite = inputData;
        } else if (selectorType === 'csv') {
            // Đối với CSV, cần phải định dạng dữ liệu với delimiter
            if (Array.isArray(inputData)) {
                dataToWrite = inputData.map(row => row.join(delimiter)).join('\n');
            } else {
                throw new Error('Input data for CSV must be an array of arrays.');
            }
        } else if (selectorType === 'json') {
            dataToWrite = JSON.stringify(inputData, null, 2);
        } else {
            throw new Error('Unsupported selector type');
        }

        if (writeMode === 'overwrite') {
            fs.writeFileSync(fullPath, dataToWrite, 'utf8');
        } else if (writeMode === 'append') {
            let existingData = '';

            if (fs.existsSync(fullPath)) {
                existingData = fs.readFileSync(fullPath, 'utf8');
            }

            if (appendMode === 'newLine') {
                fs.appendFileSync(fullPath, (existingData ? '\n' : '') + dataToWrite, 'utf8');
            } else if (appendMode === 'sameLine') {
                if (selectorType === 'txt' || selectorType === 'csv') {
                    fs.appendFileSync(fullPath, (existingData ? delimiter : '') + dataToWrite, 'utf8');
                } else {
                    fs.appendFileSync(fullPath, (existingData ? '\n' : '') + dataToWrite, 'utf8');
                }
            } else {
                throw new Error('Unsupported append mode');
            }
        } else {
            throw new Error('Unsupported write mode');
        }

        console.log(`File written: ${fullPath}`);
    } else {
        throw new Error('Unsupported action');
    }
}

async function inStallApp(uuid, apkPath) {
    try {

        await client.install(uuid, apkPath);
        return { success: true, message: "success" }
    } catch (error) {
        return { success: false, message: error.message }

    }
}


async function screenShot(port, options) {
    console.log('Options:', options);

    const screenshotName = options.fileName || 'screenshot.png';
    const outputFolder = options.folderOutput || '.';
    const localScreenshotPath = path.join(outputFolder, screenshotName);

    // Kiểm tra thư mục đích và tạo nếu cần
    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
    }

    try {
        let image = await takeScreenshot(port);
        fs.writeFileSync(localScreenshotPath, image, { encoding: 'base64' })
        return { success: true, message: "success", data: image }

    } catch (error) {
        console.log(error)
        return { success: false, message: error.message }
    }
}
async function takeScreenshot(port) {
    const url = `http://127.0.0.1:${port}/jsonrpc/0`;
    const body = {
        "jsonrpc": "2.0",
        "id": "da9ad2c67b104c65855117569c5fdcd2",
        "method": "takeScreenshot",
        "params": [
            1,
            80
        ]
    }
    let result = await fetch(url,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }

    );
    const data = await result.json();
    return data.result;
}

async function pressBack(uuid) {
    try {
        await client.shell(uuid, "input keyevent 4");
        return { success: true, message: "success" };
    } catch (error) {
        return { success: false, message: error.message }

    }

}
async function pressHome(uuid) {
    try {
        await client.shell(uuid, "input keyevent 3");
        return { success: true, message: "success" }
    } catch (error) {
        return { success: false, message: error.message }

    }
}
async function pressMenu(uuid) {
    try {
        await client.shell(uuid, "input keyevent 187");
        return { success: true, message: "success" }
    } catch (error) {
        return { success: false, message: error.message }

    }
}
async function lockPhone(uuid) {
    try {
        await client.shell(uuid, "input keyevent 26");
        return { success: true, message: "success" }
    } catch (error) {
        return { success: false, message: error.message }

    }
}
async function unlockPhone(uuid) {
    try {
        await client.shell(uuid, "input keyevent 82");
        return { success: true, message: "success" }
    } catch (error) {
        return { success: false, message: error.message }

    }
}
async function deviceActions(uuid, action) {

    switch (action) {
        case 'unlock':
            return await unlockPhone(uuid);

        default:
            return await lockPhone(uuid);

    }

}
async function getAttribute(uuid, xpathQuery, name, seconds) {
    console.log(`getAttribute: ${xpathQuery}, ${name}, ${seconds}`);

    const waitTime = seconds * 1000;
    const startTime = Date.now();
    while ((Date.now() - startTime) < timeOut) {
        let response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        response = await response.json();
        let result = response.result;
        if (result.startsWith('<?xml')) {
            // Phân tích trực tiếp nội dung XML từ biến result
            const doc = new DOMParser().parseFromString(result, 'text/xml');
            const nodes = xpath.select(selector, doc);
            if (nodes.length > 0) {
                const node = nodes[0];
                if (attributeValue) {
                    const attributeValue = node.getAttribute(name);
                    return { success: true, message: "success", data: attributeValue }
                }
                else {
                    return { success: false, message: 'Attribute not found' }
                }
            }
        }
    }
    return { success: false, message: 'Element not found' };
    // // Gửi lệnh dump giao diện người dùng
    // await sendMessageShell(uuid, `uiautomator dump /sdcard/ui.xml`);

    // setTimeout(async () => {
    //     // Nhận nội dung XML trực tiếp từ shell
    //     let result = await sendMessageShell(uuid, `cat /sdcard/ui.xml`);

    //     // Loại bỏ phần dữ liệu không phải là XML
    //     result = result.substring(result.indexOf('<?xml'));

    //     // Kiểm tra xem kết quả có phải là XML hợp lệ hay không
    //     if (result.startsWith('<?xml')) {
    //         // Phân tích chuỗi XML thành tài liệu
    //         const doc = new DOMParser().parseFromString(result, 'text/xml');
    //         const nodes = xpath.select(xpathQuery, doc);

    //         // Kiểm tra xem có phần tử nào khớp với XPath hay không
    //         if (nodes.length > 0) {
    //             const node = nodes[0];
    //             const attributeValue = node.getAttribute(name);

    //             if (attributeValue) {
    //                 console.log(`Attribute found: ${attributeValue}`);
    //                 return attributeValue;
    //             } else {
    //                 console.log('Attribute not found');
    //             }
    //         } else {
    //             console.log('Element not found');
    //         }
    //     } else {
    //         console.log('Invalid XML format');
    //     }

    // }, waitTime);
}

async function elementExists(port, xpathQuery, seconds = 10) {
    let url = `http://127.0.0.1:${port}/jsonrpc/0`;
    let result = await getPosElment(url, xpathQuery, seconds);
    if (result.success) {
        return { success: true, message: "success", data: true }
    }
    else {
        return { success: true, message: "success", data: false }
    }
}

async function adbShell(uuid, command) {
    await client.shell(uuid, command);
}
async function generate2FA(uuid, secretKey) {
    const token = speakeasy.totp({
        secret: secretKey,
        encoding: 'base32'
    });

    // Gửi mã 2FA qua WebSocket
    const message = `Generated 2FA token: ${token}`;
    await sendMessageShell(uuid, message); // Gửi tin nhắn qua WebSocket

    console.log("2FA token: ", token);
    return token
}

async function startApp(uuid, packageName) {
    try {
        await client.shell(uuid, `monkey -p ${packageName} 1`);
        return { success: true, message: "success" }

    } catch (error) {
        return { success: false, message: error.message }
    }

}
async function stopApp(uuid, packageName) {
    try {
        await client.shell(uuid, `am force-stop ${packageName}`);
        return { success: true, message: "success" }
    } catch (error) {
        return { success: false, message: error.message }
    }

}

async function unInStallApp(uuid, packageName) {
    try {
        await client.uninstall(uuid, packageName);
        return { success: true, message: success };
    } catch (error) {
        return { success: false, message: error.message };
    }
}
async function isInStallApp(uuid, packageName) {
    try {
        let isInstalled = await client.isInstalled(uuid, packageName);
        return { success: true, message: "success", data: isInstalled }
    } catch (error) {
        return { success: false, message: error.message }
    }

}
async function toggleAirplaneMode(uuid) {
    let res = await sendMessageShell(uuid, 'shell settings get global airplane_mode_on');
    res = res.data;

    // Kiểm tra xem phản hồi có chứa trạng thái chế độ máy bay không
    if (res.includes('0') || res.includes('1')) {

        const isAirplaneModeOn = res[0] === '1';

        // Dựa trên trạng thái hiện tại của chế độ máy bay, xác định lệnh bật/tắt
        const command = isAirplaneModeOn
            ? 'shell settings put global airplane_mode_on 0'  // Tắt chế độ máy bay
            : 'shell settings put global airplane_mode_on 1'; // Bật chế độ máy bay

        // Gửi lệnh bật/tắt chế độ máy bay qua WebSocket
        await sendMessageShell(uuid, command);
    }

}
async function toggleWifi(uuid) {
    let res = await sendMessageShell(uuid, 'shell settings get global wifi_on');
    res = res.data;

    console.log("res => ", res);

    // Kiểm tra xem phản hồi có chứa trạng thái Wi-Fi không
    if (res.includes("0") || res.includes("1")) {

        const isWifiEnabled = res[0] === '1';

        // Dựa trên trạng thái hiện tại của Wi-Fi, xác định lệnh bật/tắt
        const command = isWifiEnabled
            ? 'shell svc wifi disable'  // Lệnh tắt Wi-Fi
            : 'shell svc wifi enable';  // Lệnh bật Wi-Fi

        // Gửi lệnh bật/tắt Wi-Fi qua WebSocket
        await sendMessageShell(uuid, command);

    }

}
async function toggleData(uuid) {
    let res = await sendMessageShell(uuid, 'shell settings get global mobile_data');

    res = res.data;

    // Kiểm tra trạng thái của Mobile Data
    if (res.includes('0') || res.includes('1')) {
        console.log('Processing toggle');
        // Kiểm tra trạng thái của Mobile Data
        if (res.includes('0') || res.includes('1')) {
            console.log('Processing toggle');

            const isDataEnabled = res[0] === '1';

            // Dựa trên trạng thái hiện tại của Mobile Data, xác định lệnh bật/tắt
            const command = isDataEnabled
                ? 'shell svc data disable'  // Tắt Mobile Data
                : 'shell svc data enable';  // Bật Mobile Data
            await sendMessageShell(uuid, command);

        }
    }
}
async function toggleLocation(uuid) {
    // Gửi lệnh kiểm tra trạng thái Location qua WebSocket
    let res = await sendMessageShell(uuid, 'settings get secure location_mode');

    res = res.data;

    if (res.includes('0') || res.includes('1')) {

        const isLocationModeOn = res[0] === '1';

        const command = isLocationModeOn
            ? 'shell settings put secure location_mode 0'
            : 'shell settings put secure location_mode 1';

        await sendMessageShell(uuid, command);
    }
}

async function toggleService(uuid, service) {

    switch (service) {
        case 'airplane':
            toggleAirplaneMode(uuid);
        case 'airplane':
            toggleAirplaneMode(uuid);
            break;
        case 'wifi':
            toggleWifi(uuid);
        case 'wifi':
            toggleWifi(uuid);
            break;
        case 'network':
            toggleData(uuid);
        case 'network':
            toggleData(uuid);
            break;
        case 'location':
            toggleLocation(uuid);
        case 'location':
            toggleLocation(uuid);
            break;
        default:
    }

}


async function transferFile(deviceId, action, localFilePath, remoteFilePath) {
    try {
        if (action === 'push') {
            await pushFile(deviceId, localFilePath, remoteFilePath);
        } else if (action === 'pull') {
            await pullFile(deviceId, localFilePath, remoteFilePath);
        }
        return { success: true, message: "success" };
    } catch (error) {
        return { success: false, message: error.message };
    }


}
async function pullFile(deviceId, localFilePath, remoteFilePath) {
    return new Promise(function (resolve, reject) {
        client.pull(deviceId, remoteFilePath)
            .then(function (transfer) {
                transfer.on('end', function () {
                    resolve(device.id)
                })
                transfer.on('error', reject);
                transfer.pipe(fs.createWriteStream(localFilePath))

            })
    })
}
async function pushFile(deviceId, localFilePath, remoteFilePath) {
    return new Promise(function (resolve, reject) {
        client.push(deviceId, localFilePath, remoteFilePath)
            .then(function (transfer) {
                transfer.on('end', function () {
                    resolve(device.id)
                })
                transfer.on('error', reject);

            })
    })
}






async function touch(uuid, selectBy = 'selector', options, touchType = 'Normal', delay = 100) {
    let x, y;

    if (selectBy === 'selector') {
        const { xpathQuery } = options
        // Gửi lệnh để tạo bản dump của giao diện người dùng
        await sendMessageShell(uuid, `shell uiautomator dump /sdcard/ui.xml`);

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Đọc nội dung file XML
        let result = await sendMessageShell(uuid, `shell cat /sdcard/ui.xml`);
        result = result.substring(result.indexOf('<?xml'));

        // Kiểm tra xem kết quả có phải là XML không
        if (result.startsWith('<?xml')) {
            // Phân tích trực tiếp nội dung XML từ biến result
            // const doc = new DOMParser().parseFromString(result, 'text/xml');
            const nodes = xpath.select(xpathQuery, result);
            console.log(nodes)

            if (nodes.length > 0) {
                console.log(`Element found: ${nodes.length}`);

                const boundsAttr = nodes[0].getAttribute('bounds');
                const boundsRegex = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/;
                const match = boundsAttr.match(boundsRegex);
                if (nodes.length > 0) {
                    console.log(`Element found: ${nodes.length}`);

                    const boundsAttr = nodes[0].getAttribute('bounds');
                    const boundsRegex = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/;
                    const match = boundsAttr.match(boundsRegex);

                    if (match) {
                        const [left, top, right, bottom] = match.slice(1).map(Number);
                        x = Math.floor((left + right) / 2);
                        y = Math.floor((top + bottom) / 2);
                    }
                } else {
                    console.log("Element not found for the given XPath.");
                    return;
                }
            } else {
                console.log("Invalid XML format.");
                return;
            }
        } else if (selectBy === 'coordinate') {
            const { xCoordinate, yCoordinate } = options
            // Sử dụng tọa độ trực tiếp từ tham số đầu vào
            x = xCoordinate;
            y = yCoordinate;
            console.log(`Using provided coordinates: X: ${x}, Y: ${y}`);
        } else {
            console.log("Invalid SelectBy option. Use 'selector' or 'coordinates'.");
            return;
        }

        const timeOutMilliseconds = options.timeOut * 1000;

        console.log(`Touching element with coordinates: X: ${x}, Y: ${y}`);

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

        setTimeout(() => {
            sendMessageShell(uuid, touchCommand);
        }, delay);

    }
}


async function swipeSimple(port, direction) {

    let startX, startY, endX, endY;

    switch (direction) {
        case 'up':
            startX = 500;
            startY = 1000;
            endX = 500;
            endY = 200;
            break;
        case 'down':
            startX = 500;
            startY = 300;
            endX = 500;
            endY = 800;
            break;
        case 'left':
            startX = 600;
            startY = 500;
            endX = 300;
            endY = 500;
            break;
        case 'right':
            startX = 200;
            startY = 500;
            endX = 1000;
            endY = 500;
            break;
        default:
    }
    let body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "swipe",
        "params": [
            startX,
            startY,
            endX,
            endY,
            50
        ]
    }
    console.log(body)
    return postData(port, body);

}
async function swipeCustom(port, startX, startY, endX, endY, duration) {
    let body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "swipe",
        "params": [
            startX,
            startY,
            endX,
            endY,
            duration
        ]
    }
    return postData(port, body);
}

async function swipeScroll(port, mode, options) {
    if (mode === 'custom') {
        let { startX, startY, endX, endY, duration } = options;
        return await swipeCustom(port, startX, startY, endX, endY, duration);
    } else {
        let { direction } = options;
        return await swipeSimple(port, direction);
    }
}

async function pressKey(port, keyCode) {

    let body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "pressKeyCode",
        "params": [keyCode]
    }
    return await postData(port, body);

}
async function postData(port, body) {
    try {
        let url = `http://127.0.0.1:${port}/jsonrpc/0`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        let result = await res.json();
        console.log(result);
        if (result.result) {
            return { success: true, message: "success" }
        }
        else {
            return { success: false, message: "" }
        }
    } catch (error) {
        console.log(error)
        return { success: false, message: error.message }
    }
}

async function typeText(port, deviceId, selector, seconds, text) {
    let url = `http://127.0.0.1:${port}/jsonrpc/0`;

    const result = await getPosElment(url, selector, seconds, true);
    if (!result.success) return result;
    const textBase64 = Buffer.from(text).toString('base64')
    client.shell(deviceId, `am broadcast -a ADB_KEYBOARD_SET_TEXT --es text ${textBase64}`);
    return { success: true, message: "success" }
}
async function getPosElment(url, selector, timeOut = 0, focus = true) {
    let body = {
        "jsonrpc": "2.0",
        "id": "da9ad2c67b104c65855117569c5fdcd2",
        "method": "dumpWindowHierarchy",
        "params": [
            false,
            50
        ]
    }
    timeOut = timeOut * 1000;
    const startTime = Date.now();
    while ((Date.now() - startTime) < timeOut) {
        let response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        response = await response.json();
        let result = response.result;
        if (result.startsWith('<?xml')) {
            // Phân tích trực tiếp nội dung XML từ biến result
            const doc = new DOMParser().parseFromString(result, 'text/xml');
            const nodes = xpath.select(selector, doc);
            if (nodes.length > 0) {
                const node = nodes[0];
                const boundsAttr = node.getAttribute('bounds');

                // Tìm tọa độ từ thuộc tính 'bounds'
                const boundsRegex = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/;
                const match = boundsAttr.match(boundsRegex);

                if (match) {
                    const [left, top, right, bottom] = match.slice(1).map(Number);
                    const x = Math.floor((left + right) / 2);
                    const y = Math.floor((top + bottom) / 2);
                    if (focus) {
                        body = {
                            "jsonrpc": "2.0",
                            "id": "a2254a2f42f44da3a8b6e81d83e9627b",
                            "method": "click",
                            "params": [
                                x,
                                y
                            ]
                        }
                        await fetch(address, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(body)
                        });
                    }
                    return { success: true, message: "success", data: { x, y } }
                }
                else {
                    return { success: false, message: 'Invalid bounds attribute format' };
                }
            }
        }
    }
    return { success: false, message: 'Element not found' };
}



module.exports = {
    startApp,
    stopApp,
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
    swipeScroll,
    screenShot,
    pressKey,
    typeText,
    // getDeviceList,
    // connectWebSocket,
    // deviceManager,
    // getDevices,
    // deleteDevices,
    //adbShell,
    generate2FA,
    elementExists,
    getAttribute,
    imapReadMail,
    actionFile,
    generate2FA,
    getAttribute,
    imapReadMail,
    actionFile
}