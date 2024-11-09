require('dotenv').config();
const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const logger2 = require('./TldLogger');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const qrcode = require('qrcode-terminal');

const intro = 'Telegram Query ID Bot';
const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const botFilePath = 'bot.json';
const sessionFolder = 'sessions';
const webviewFolder = 'webview_results';
const queryFolder = 'query';

if (!apiId || !apiHash) {
    console.error('\nAPI_ID atau API_HASH belum didefinisikan di file .env\n');
    process.exit(1);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Fungsi untuk menanyakan pertanyaan menggunakan readline
function askQuestion(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

// Fungsi untuk memuat atau membuat file bot.json
function loadBotData() {
    if (!fs.existsSync(botFilePath)) {
        fs.writeFileSync(botFilePath, JSON.stringify({}), 'utf8');
    }
    const data = fs.readFileSync(botFilePath, 'utf8');
    return JSON.parse(data);
}

// Fungsi untuk menyimpan data ke file bot.json
function saveBotData(data) {
    fs.writeFileSync(botFilePath, JSON.stringify(data, null, 2), 'utf8');
}

// Fungsi untuk menampilkan daftar bot yang tersedia
async function selectBot() {
    const botData = loadBotData();
    const botPeers = Object.keys(botData);

    console.log("Pilih Bot:");
    console.log("1. Tambah bot baru");

    botPeers.forEach((botPeer, index) => {
        console.log(`${index + 2}. ${botPeer}`);
    });

    const choice = await askQuestion("Masukkan pilihan Anda: ");
    if (choice === '1') {
        const botPeer = await askQuestion("Silakan masukkan bot peer (misalnya, @YourBot): ");
        const url = await askQuestion("Silakan masukkan URL Refferal: ");
        botData[botPeer] = url;
        saveBotData(botData);
        console.log(`Bot ${botPeer} telah disimpan dengan URL: ${url}`);
        return { botPeer, url };
    } else {
        const index = parseInt(choice, 10) - 2;
        if (index >= 0 && index < botPeers.length) {
            const botPeer = botPeers[index];
            const url = botData[botPeer];
            console.log(`Menggunakan bot: ${botPeer} dengan URL: ${url}`);
            return { botPeer, url };
        } else {
            console.log("Pilihan tidak valid.");
            return null;
        }
    }
}

// Fungsi untuk login menggunakan nomor telepon

async function loginWithPhoneNumber() {
    const phoneNumber = await askQuestion("Nomor telepon Anda (misalnya, +1234567890): ");
    const sanitizedPhone = phoneNumber.replace(/\D/g, ''); // Sanitasi nomor telepon
    const sessionFile = path.join(sessionFolder, `${sanitizedPhone}.session`);

    // Periksa apakah file session sudah ada
    if (fs.existsSync(sessionFile)) {
        console.log(`Sesi untuk nomor telepon ${phoneNumber} sudah ada di ${sessionFile}`);
        return; // Keluarkan fungsi jika file session sudah ada
    }

    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, apiId, apiHash, { 
        connectionRetries: 5, 
        timeout: 1800000, 
        baseLogger: logger2 
    });

    await client.start({
        phoneNumber: async () => phoneNumber,
        phoneCode: async () => await askQuestion("Kode yang Anda terima: "),
        password: async () => await askQuestion("Kata sandi Anda: "),
        onError: (error) => console.error("Error:", error),
    });

    console.log('Login berhasil');

    const sessionString = client.session.save();

    // Buat folder untuk menyimpan session jika belum ada
    if (!fs.existsSync(sessionFolder)) {
        fs.mkdirSync(sessionFolder, { recursive: true });
    }

    // Simpan sesi dalam file
    fs.writeFileSync(sessionFile, sessionString, 'utf8');
    console.log(`Sesi disimpan di ${sessionFile}`);

    await client.disconnect();
    await client.destroy();
}

// Fungsi untuk login menggunakan QR Code
async function loginWithQRCode() {
    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, apiId, apiHash, { 
        connectionRetries: 5, 
        timeout: 1800000, 
        baseLogger: logger2 
    });

    while (true) {
        try {
            await client.connect();

            let isShown = false;
            await client.signInUserWithQrCode({
                apiId: apiId,
                apiHash: apiHash,
            }, {
                qrCode: async (code) => {
                    if (!isShown) {
                        console.log("\nScan QR code below with your Telegram app to login:\n");
                        qrcode.generate(`tg://login?token=${code.token.toString("base64url")}`, { small: true }, (qrcodeString) => {
                            console.log(qrcodeString);
                        });
                        isShown = true;
                    } else {
                        readline.moveCursor(process.stdout, 0, -6);
                        readline.clearScreenDown(process.stdout);
                        console.log("\nNew QR code received\n");
                        qrcode.generate(`tg://login?token=${code.token.toString("base64url")}`, { small: true }, (qrcodeString) => {
                            console.log(qrcodeString);
                        });
                    }
                },
                password: async () => await askQuestion("kata sandi Anda: "),
                onError: (error) => {
                    console.error("Error saat login dengan QR code:", error);
                    if (error.code === 400 && error.errorMessage === 'AUTH_TOKEN_EXPIRED') {
                        console.log("Token kedaluwarsa. Coba lagi untuk mendapatkan QR code baru.");
                    }
                },
            });

            console.log('Login berhasil');
            const sessionString = client.session.save();
            const me = await client.getMe();
            const sanitizedPhone = me.phone || me.username || "qr_code_login";  // Gunakan nomor telepon atau username
            const sessionFile = path.join(sessionFolder, `${sanitizedPhone}.session`);

            // Periksa apakah file session sudah ada
            if (fs.existsSync(sessionFile)) {
                console.log(`Sesi untuk ${sanitizedPhone} sudah ada di ${sessionFile}`);
                break; // Keluar jika session sudah ada
            }

            // Jika file session belum ada, simpan sesi
            if (!fs.existsSync(sessionFolder)) {
                fs.mkdirSync(sessionFolder, { recursive: true });
            }

            fs.writeFileSync(sessionFile, sessionString, 'utf8');
            console.log(`Sesi disimpan di ${sessionFile}`);
            break;
        } catch (error) {
            console.log("Mencoba lagi untuk mendapatkan QR code baru...");
        }
    }

    await client.disconnect();
    await client.destroy();
}

async function handleSessionFile(selectedFile, botPeer, url, latestResults) {
    const sessionFolder = 'sessions';
    const sessionData = fs.readFileSync(path.join(sessionFolder, selectedFile), 'utf8');

    if (!sessionData || sessionData.trim() === '') {
        console.log(`File sesi ${selectedFile} kosong atau tidak valid.`);
        return;
    }

    let client; // Deklarasi client di sini agar bisa diakses dalam finally

    try {
        client = new TelegramClient(new StringSession(sessionData), apiId, apiHash, { 
            connectionRetries: 5, 
            timeout: 1800000, 
            baseLogger: logger2 
        });

        // Gunakan start() untuk autentikasi
        await client.start();

        // Meminta WebView untuk client
        await requestWebViewForClient(client, selectedFile, botPeer, url, latestResults);
    } catch (error) {
        console.log(`Gagal login ${selectedFile}`, error);
    }

    await client.disconnect();
    await client.destroy();
}

async function loginWithSessionFile() {
    const sessionFolder = 'sessions';
    const sessionFiles = fs.readdirSync(sessionFolder).filter(file => file.endsWith('.session'));

    if (sessionFiles.length === 0) {
        console.log('Tidak ada file sesi (.session) yang ditemukan.');
        return;
    }

    const latestResults = [];
    const webviewFolder = 'webview_results';
    const botFilePath = 'bot.json';
    let counter = 1;

    // Memilih bot
    const botSelection = await selectBot();
    if (!botSelection) {
        console.log("Gagal memilih bot. Program akan berhenti.");
        process.exit(1);
    }

    const { botPeer, url } = botSelection;

    console.log(`Total file sesi: ${sessionFiles.length}`);

    // Proses semua file sesi
    for (const file of sessionFiles) {
        console.log(`Login - ${counter}/${sessionFiles.length} | ${file}          \r`);
        await handleSessionFile(file, botPeer, url, latestResults);
        counter++;
    }

    // Menyimpan hasil ke file khusus untuk bot
    const botFileName = botPeer.replace('@', '') + '.txt';
    const queryFolder = 'query';
    if (!fs.existsSync(queryFolder)) {
        fs.mkdirSync(queryFolder, { recursive: true });
    }

    const botFile = path.join(queryFolder, botFileName);
    const allResults = latestResults.map(({ webAppData }) => webAppData).join('\n');

    fs.writeFileSync(botFile, allResults.trim(), 'utf8');
    console.log(`Hasil untuk ${botPeer} disimpan di ${botFile}`);
}

// Fungsi untuk meminta WebView untuk klien
async function requestWebViewForClient(client, phoneNumber, botPeer, url, latestResults) {
    try {
        const result = await client.invoke(
            new Api.messages.RequestWebView({
                peer: botPeer,
                bot: botPeer,
                fromBotMenu: false,
                url: url,
                platform: 'android',
            })
        );

        const webAppData = decodeURIComponent(result.url.split('#')[1].split('&')[0].split('=')[1]);
        latestResults.push({ phoneNumber, webAppData });
        console.log('\x1b[32mGET Query ID\x1b[0m');
    } catch (error) {
        console.log(`Error saat meminta Query ID: ${phoneNumber}`);
    }
}

// Fungsi utama untuk menangani input pengguna
async function main() {
    console.log('Selamat datang di Utilitas Bot Telegram!');
    console.log(intro);

    while (true) {
        console.log('1. Login dengan nomor telepon');
        console.log('2. Login dengan QR Code');
        console.log('3. Meminta Query ID ke semua klien');
        console.log('4. Keluar');

        const choice = await askQuestion("Silakan pilih opsi: ");
        switch (choice) {
            case '1':
                await loginWithPhoneNumber();
                break;
            case '2':
                await loginWithQRCode();
                break;
            case '3':
                await loginWithSessionFile();
                break;
            case '4':
                process.exit(1);
            default:
                console.log("Pilihan tidak valid.");
        }
    }
}

main();
