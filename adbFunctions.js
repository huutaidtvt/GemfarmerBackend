const fs = require('fs');
const xpath = require('xpath');
const { DOMParser } = require('xmldom');
const Jimp = require('jimp');
const { createBuffer, getBufferData } = require('./createMessage');
const path = require('path');
const speakeasy = require('speakeasy');
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
async function sendMessageShell(ws, message) {
    return new Promise((resolve, reject) => {
        let dataSend = createBuffer(32, 1, getBufferData(message));
        let dataResponse;
        ws.on('message', (data) => {
            console.log("data===>",data.toString())
            let strHex = toHexString(data);
            if (strHex.endsWith("3a2f202420")) {
                ws.removeAllListeners();
                resolve({success:true,message:"success",data:dataResponse});
            }
            else{
                dataResponse=data.toString().substring(5);
            }
        });
        setTimeout(()=>{resolve({success:false,message:"timeout"})},5000)
        ws.send(dataSend);
        ws.send([0x20, 0x01, 0x00, 0x00, 0x00, 0x0d, 0x0a]);
    })

}

function toHexString(byteArray) {
    return Array.from(byteArray, function (byte) {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('')
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

    // Gửi lệnh dump giao diện người dùng
    await sendMessageShell(ws, `uiautomator dump /sdcard/ui.xml`);

    setTimeout(async () => {
        // Nhận nội dung XML trực tiếp từ shell
        let result = await sendMessageShell(ws, `cat /sdcard/ui.xml`);

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

async function elementExists(ws, xpathQuery, seconds = 10) {

    console.log(`ElementExists: ${xpathQuery}, ${seconds}`);

    // Gửi lệnh để dump giao diện người dùng
    await sendMessageShell(ws, `uiautomator dump /sdcard/ui.xml`);

    // Sử dụng setTimeout để chờ một khoảng thời gian trước khi kiểm tra
    setTimeout(async () => {

        // Nhận nội dung XML từ thiết bị thông qua WebSocket
        let result = await sendMessageShell(ws, `cat /sdcard/ui.xml`);

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

    console.log("2FA token: ", token);
    return token
}

async function startApp(ws, packageName) {
    await sendMessageShell(ws, `monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`)
}
async function stopApp(ws, packageName) {
    await sendMessageShell(ws, `am force-stop ${packageName}`);
}

async function unInStallApp(ws, packageName) {
    await sendMessageShell(ws, `pm uninstall ${packageName}`);
}
async function isInStallApp(ws, packageName) {
    let isInstalled = await sendMessageShell(ws, `pm list packages | grep  ${packageName}`);

    if (isInstalled.includes(packageName)) {
        console.log(`${packageName} is installed.`);
        return true
    } else {
        console.log(`${packageName} is not installed.`);
        return false
    }
}
async function toggleAirplaneMode(ws) {
    let res = await sendMessageShell(ws, 'settings get global airplane_mode_on');
    console.log(res)
    res = res.data;

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
        case 'airplane':
            toggleAirplaneMode(ws);
            break;
        case 'wifi':
            toggleWifi(ws);
            break;
        case 'network':
            toggleData(ws);
            break;
        case 'location':
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

// async function touch(ws, xpathQuery, timeOut = 10, touchType = 'Normal', delay = 100) {
//     console.log(`Touch: ${xpathQuery}, ${timeOut}, ${touchType}, ${delay}`);

//     // Gửi lệnh để tạo bản dump của giao diện người dùng
//     await sendMessageShell(ws, `uiautomator dump /sdcard/ui.xml`);

//     // Đọc nội dung file XML
//     let result = await sendMessageShell(ws, `cat /sdcard/ui.xml`);

//     result = result.substring(result.indexOf('<?xml'));

//     // Kiểm tra xem kết quả có phải là XML không
//     if (result.startsWith('<?xml')) {
//         // Phân tích trực tiếp nội dung XML từ biến result thay vì lưu vào file
//         const doc = new DOMParser().parseFromString(result);
//         const nodes = xpath.select(xpathQuery, doc);

//         if (nodes.length > 0) {
//             console.log(`Element found: ${nodes.length}`);

//             const boundsAttr = nodes[0].getAttribute('bounds');
//             const boundsRegex = /(\d+),(\d+)\]\[(\d+),(\d+)/;
//             const match = boundsAttr.match(boundsRegex);

//             if (match) {
//                 const [left, top, right, bottom] = match.slice(1).map(Number);
//                 const x = Math.floor((left + right) / 2);
//                 const y = Math.floor((top + bottom) / 2);

//                 const timeOutMilliseconds = timeOut * 1000;

//                 let touchCommand;
//                 switch (touchType) {
//                     case 'Long':
//                         touchCommand = `input swipe ${x} ${y} ${x} ${y} ${timeOutMilliseconds}`;
//                         break;
//                     case 'Double':
//                         touchCommand = `input tap ${x} ${y} && input tap ${x} ${y}`;
//                         break;
//                     default:
//                         touchCommand = `input tap ${x} ${y}`;
//                         break;
//                 }

//                 // Gửi lệnh chạm sau một khoảng thời gian trễ (nếu có)
//                 if (delay > 0) {
//                     setTimeout(() => {
//                         sendMessageShell(ws, touchCommand);
//                     }, delay);
//                 } else {
//                     await sendMessageShell(ws, touchCommand);
//                 }
//             }
//         } else {
//             console.log("Element not found for the given XPath.");
//         }
//     } else {
//         console.log("Invalid XML format.");
//     }
// }

async function touch(ws, selectBy = 'selector', options, touchType = 'Normal', delay = 100) {
    let x, y;

    if (selectBy === 'selector') {
        const { xpathQuery } = options
        // Gửi lệnh để tạo bản dump của giao diện người dùng
        await sendMessageShell(ws, `uiautomator dump /sdcard/ui.xml`);

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Đọc nội dung file XML
        let result = await sendMessageShell(ws, `cat /sdcard/ui.xml`);
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
        sendMessageShell(ws, touchCommand);
    }, delay);

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

    await sendMessageShell(ws, `input swipe ${startX} ${startY} ${endX} ${endY}`);

}
async function swipeCustom(ws, startX, startY, endX, endY, duration) {
    await sendMessageShell(ws, `input swipe ${startX} ${startY} ${endX} ${endY} ${duration}`);
}

async function swipeScroll(ws, mode, options) {
    if (mode === 'custom') {
        let { startX, startY, endX, endY, duration } = options;
        await swipeCustom(ws, startX, startY, endX, endY, duration);
    } else {
        let { direction } = options;
        await swipeSimple(ws, direction);
    }
}

async function pressKey(ws, keyCode) {
    await sendMessageShell(ws, `input keyevent ${keyCode}`);
}

async function typeText(ws, selector, seconds = 10, text) {
    console.log(`Selector: ${selector}, Duration: ${seconds}, Text: ${text}`);

    // Gửi lệnh để tạo bản dump của giao diện người dùng
    await sendMessageShell(ws, 'uiautomator dump /sdcard/ui.xml');

    setTimeout(async () => {
        // Đọc nội dung file XML từ thiết bị
        let result = await sendMessageShell(ws, `cat /sdcard/ui.xml`);

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
                    await sendMessageShell(ws, `input tap ${x} ${y}`);

                    // Bước 4: Nhập văn bản vào trường
                    const escapedText = text.replace(/ /g, '%s'); // Escape khoảng trắng
                    const typeCommand = `input text "${escapedText}"`;

                    console.log(`Executing command: ${typeCommand}`);
                    await sendMessageShell(ws, typeCommand);

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
    adbShell,
    generate2FA,
    elementExists,
    getAttribute,
    imapReadMail,
    actionFile
}  