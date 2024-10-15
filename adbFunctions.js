const fs = require('fs');
const xpath = require('xpath');
const { DOMParser } = require('xmldom');
const Jimp = require('jimp');
const { createBuffer, getBufferData } = require('./createMessage');
const path = require('path');
const speakeasy = require('speakeasy');
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const adbPath = path.join(__dirname, "adbTool/adb.exe")
const { spawn } = require('child_process');

// async function sendMessageShell(ws, message) {
//     return new Promise((resolve, reject) => {
//         let dataSend = createBuffer(32, 1, getBufferData(message));
//         let dataResponse;
//         ws.on('message', (data) => {
//             console.log("data===>", data.toString())
//             let strHex = toHexString(data);
//             if (strHex.endsWith("3a2f202420")) {
//                 ws.removeAllListeners();
//                 resolve({ success: true, message: "success", data: dataResponse });
//             }
//             else {
//                 dataResponse = data.toString().substring(5);
//             }
//         });
//         setTimeout(() => { resolve({ success: false, message: "timeout" }) }, 5000)
//         ws.send(dataSend);
//         ws.send([0x20, 0x01, 0x00, 0x00, 0x00, 0x0d, 0x0a]);
//     })

// }
async function sendMessageShell(uuid, message) {
    console.log(uuid,message)
    return new Promise((resolve, reject) => {
        const cmdProcess = spawn(`${adbPath} -s ${uuid} ${message} `, { shell: true });
        let output = '';

        // Ghi nhận đầu ra
        cmdProcess.stdout.on('data', (data) => {
            output += data.toString();
        });
        // Xử lý lỗi
        cmdProcess.stderr.on('data', (data) => {
            // Gửi thông báo lỗi nếu có
            reject({
                success: false,
                message: `Error: ${data.toString()}`.trim() // Chuyển đổi dữ liệu thành chuỗi
            });
        });

        // Khi lệnh hoàn thành
        cmdProcess.on('close', (code) => {
            console.log("end",output)


            resolve({
                success: true,
                message: "success",
                data: output // Trả về kết quả
            });

        });
    });
}


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
    await sendMessageShell(uuid, `pm install ${apkPath}`);
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

async function screenShot(uuid, options) {
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
        await sendMessageShell(uuid, screenshotCommand);

        // Đợi một chút để thiết bị xử lý lệnh chụp màn hình
        await new Promise(resolve => setTimeout(resolve, 2000)); // Tăng thời gian chờ

        // Bước 2: Tải ảnh chụp màn hình về máy tính qua WebSocket
        const pullCommand = 'cat /sdcard/screenshot.png';
        const screenshotData = await sendMessageShell(uuid, pullCommand);

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
            await sendMessageShell(uuid, removeCommand);

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

async function pressBack(uuid) {
    await sendMessageShell(uuid, "shell input keyevent 4");
}
async function pressHome(uuid) {
    await sendMessageShell(uuid, "shell input keyevent 3");
}
async function pressMenu(uuid) {
    await sendMessageShell(uuid, "shell input keyevent 187");
}
async function lockPhone(uuid) {
    await sendMessageShell(uuid, "shell input keyevent 26")
}
async function unlockPhone(uuid) {
    await sendMessageShell(uuid, "shell input keyevent 82");
}
async function deviceActions(uuid, action) {

    switch (action) {
        case 'unlock':
            await unlockPhone(uuid);
            break;
        default:
            await lockPhone(uuid);
            break;
    }

}
async function getAttribute(uuid, xpathQuery, name, seconds) {
    console.log(`getAttribute: ${xpathQuery}, ${name}, ${seconds}`);

    const waitTime = seconds * 1000;

    // Gửi lệnh dump giao diện người dùng
    await sendMessageShell(uuid, `uiautomator dump /sdcard/ui.xml`);

    setTimeout(async () => {
        // Nhận nội dung XML trực tiếp từ shell
        let result = await sendMessageShell(uuid, `cat /sdcard/ui.xml`);

        // Loại bỏ phần dữ liệu không phải là XML
        result = result.substring(result.indexOf('<?xml'));

        // Kiểm tra xem kết quả có phải là XML hợp lệ hay không
        if (result.startsWith('<?xml')) {
            // Phân tích chuỗi XML thành tài liệu
            const doc = new DOMParser().parseFromString(result, 'text/xml');
            const nodes = xpath.select(xpathQuery, doc);

            // Kiểm tra xem có phần tử nào khớp với XPath hay không
            if (nodes.length > 0) {
                const node = nodes[0];
                const attributeValue = node.getAttribute(name);

                if (attributeValue) {
                    console.log(`Attribute found: ${attributeValue}`);
                    return attributeValue;
                } else {
                    console.log('Attribute not found');
                }
            } else {
                console.log('Element not found');
            }
        } else {
            console.log('Invalid XML format');
        }

    }, waitTime);
}

async function elementExists(uuid, xpathQuery, seconds = 10) {

    console.log(`ElementExists: ${xpathQuery}, ${seconds}`);

    // Gửi lệnh để dump giao diện người dùng
    await sendMessageShell(uuid, `uiautomator dump /sdcard/ui.xml`);

    // Sử dụng setTimeout để chờ một khoảng thời gian trước khi kiểm tra
    setTimeout(async () => {

        // Nhận nội dung XML từ thiết bị thông qua WebSocket
        let result = await sendMessageShell(uuid, `cat /sdcard/ui.xml`);

        // Loại bỏ phần không phải XML nếu cần
        result = result.substring(result.indexOf('<?xml'));

        // Kiểm tra xem kết quả có phải là XML hợp lệ không
        if (result.startsWith('<?xml')) {
            // Phân tích chuỗi XML thành đối tượng tài liệu
            const doc = new DOMParser().parseFromString(result, 'text/xml');
            const nodes = xpath.select(xpathQuery, doc);

            // Kiểm tra sự tồn tại của phần tử dựa trên XPath
            if (nodes.length > 0) {
                console.log(`Element found: ${nodes.length}`);
                return true;
            } else {
                console.log('Element not found');
                return false;
            }
        } else {
            console.log('Invalid XML format');
            return false;
        }

    }, seconds * 1000); // Thời gian chờ theo giây
}

async function adbShell(uuid, command) {
    await sendMessageShell(uuid, command);
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
    await sendMessageShell(uuid, `shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`)
}
async function stopApp(uuid, packageName) {
    await sendMessageShell(uuid, `shell am force-stop ${packageName}`);
}

async function unInStallApp(uuid, packageName) {
    await sendMessageShell(uuid, `shell pm uninstall ${packageName}`);
}
async function isInStallApp(uuid, packageName) {
    let isInstalled = await sendMessageShell(uuid, `shell pm list packages | grep  ${packageName}`);

    if (isInstalled.includes(packageName)) {
        console.log(`${packageName} is installed.`);
        return true
    } else {
        console.log(`${packageName} is not installed.`);
        return false
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
async function transferFile(uuid, action, localFilePath, remoteFilePath) {

    async function transferFile(uuid, action, localFilePath, remoteFilePath) {

        let command;


        if (action === 'push') {
            command = `push "${localFilePath}" "${remoteFilePath}"`;
        } else if (action === 'pull') {
            command = `pull "${remoteFilePath}" "${localFilePath}"`;
        }

        await sendMessageShell(uuid, command);
    }

    await sendMessageShell(uuid, command);

}



async function touch(uuid, selectBy = 'selector', options, touchType = 'Normal', delay = 100) {
    let x, y;

    if (selectBy === 'selector') {
        const { xpathQuery } = options
        // Gửi lệnh để tạo bản dump của giao diện người dùng
        await sendMessageShell(uuid, `uiautomator dump /sdcard/ui.xml`);

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Đọc nội dung file XML
        let result = await sendMessageShell(uuid, `cat /sdcard/ui.xml`);
        result = result.substring(result.indexOf('<?xml'));

        // Kiểm tra xem kết quả có phải là XML không
        if (result.startsWith('<?xml')) {
            // Phân tích trực tiếp nội dung XML từ biến result
            const doc = new DOMParser().parseFromString(result, 'text/xml');
            const nodes = xpath.select(xpathQuery, doc);

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


async function swipeSimple(uuid, direction) {

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

    await sendMessageShell(uuid, `input swipe ${startX} ${startY} ${endX} ${endY}`);

}
async function swipeCustom(uuid, startX, startY, endX, endY, duration) {
    await sendMessageShell(uuid, `input swipe ${startX} ${startY} ${endX} ${endY} ${duration}`);
}

async function swipeScroll(uuid, mode, options) {
    if (mode === 'custom') {
        let { startX, startY, endX, endY, duration } = options;
        await swipeCustom(uuid, startX, startY, endX, endY, duration);
    } else {
        let { direction } = options;
        await swipeSimple(uuid, direction);
    }
}

async function pressKey(uuid, keyCode) {
    await sendMessageShell(uuid, `input keyevent ${keyCode}`);
}

async function typeText(uuid, selector, seconds = 10, text) {
    console.log(`Selector: ${selector}, Duration: ${seconds}, Text: ${text}`);

    // Gửi lệnh để tạo bản dump của giao diện người dùng
    await sendMessageShell(uuid, 'uiautomator dump /sdcard/ui.xml');

    setTimeout(async () => {
        // Đọc nội dung file XML từ thiết bị
        let result = await sendMessageShell(uuid, `cat /sdcard/ui.xml`);

        // Loại bỏ phần không phải XML
        result = result.substring(result.indexOf('<?xml'));

        // Kiểm tra xem kết quả có phải là XML không
        if (result.startsWith('<?xml')) {
            // Phân tích trực tiếp nội dung XML từ biến result
            const doc = new DOMParser().parseFromString(result, 'text/xml');
            const nodes = xpath.select(selector, doc);

            if (nodes.length > 0) {
                const node = nodes[0];
                const boundsAttr = node.getAttribute('bounds');

                if (!boundsAttr) {
                    console.log('No bounds attribute found for the element');
                    return;
                }

                // Tìm tọa độ từ thuộc tính 'bounds'
                const boundsRegex = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/;
                const match = boundsAttr.match(boundsRegex);

                if (match) {
                    const [left, top, right, bottom] = match.slice(1).map(Number);
                    const x = Math.floor((left + right) / 2);
                    const y = Math.floor((top + bottom) / 2);

                    // Bước 3: Nhấp vào trường để chọn nó
                    console.log(`Tapping on (${x}, ${y})...`);
                    await sendMessageShell(uuid, `input tap ${x} ${y}`);

                    // Bước 4: Nhập văn bản vào trường
                    const escapedText = text.replace(/ /g, '%s'); // Escape khoảng trắng
                    const typeCommand = `input text "${escapedText}"`;

                    console.log(`Executing command: ${typeCommand}`);
                    await sendMessageShell(uuid, typeCommand);

                } else {
                    console.log('Invalid bounds attribute format');
                }
            } else {
                console.log("Element not found for the given XPath.");
            }
        } else {
            console.log("Invalid XML format.");
        }
    }, seconds * 1000);
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
    elementExists,
    getAttribute,
    imapReadMail,
    actionFile
}