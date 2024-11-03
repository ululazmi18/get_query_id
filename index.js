require('dotenv').config(); // Mengimpor dotenv

const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const logger2 = require('./TldLogger');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const qrcode = require('qrcode-terminal');

const intro = 'Telegram Query ID Bot';
const apiId = Number(process.env.API_ID); // API ID Anda
const apiHash = process.env.API_HASH; // API Hash Anda

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Fungsi untuk menanyakan pertanyaan menggunakan readline
function askQuestion(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

const accounts = new Map();

// Fungsi untuk login menggunakan nomor telepon
async function loginWithPhoneNumber() {
    const phoneNumber = await askQuestion("nomor telepon Anda (misalnya, +1234567890): ");
    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5, baseLogger: logger2 });

    await client.start({
        phoneNumber: async () => phoneNumber,
        phoneCode: async () => await askQuestion("Kode yang Anda terima: "),
        password: async () => await askQuestion("Kata sandi Anda: "),
        onError: (error) => console.error("Error:", error),
    });

    console.log('Login berhasil');

    const sessionString = client.session.save();
    const sessionFolder = 'sessions';
    const sanitizedPhone = phoneNumber.replace(/\D/g, '');
    const sessionFile = path.join(sessionFolder, `${sanitizedPhone}.session`);

    if (!fs.existsSync(sessionFolder)) {
        fs.mkdirSync(sessionFolder, { recursive: true });
    }

    fs.writeFileSync(sessionFile, sessionString, 'utf8');
    console.log(`Sesi disimpan di ${sessionFile}`);
    accounts.set(phoneNumber, client);
}

// Fungsi untuk login menggunakan QR Code
async function loginWithQRCode() {
    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5, baseLogger: logger2 });

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
                        return; // keluar dari try dan mulai ulang loop untuk mendapatkan QR code baru
                    }
                },
            });

            console.log('Login berhasil');

            const sessionString = client.session.save();
            const sessionFolder = 'sessions';

            // Mendapatkan informasi pengguna
            const me = await client.getMe();
            const sanitizedPhone = me.phone || me.username || "qr_code_login"; // Menggunakan nomor telepon atau nama pengguna
            const sessionFile = path.join(sessionFolder, `${sanitizedPhone}.session`);

            if (!fs.existsSync(sessionFolder)) {
                fs.mkdirSync(sessionFolder, { recursive: true });
            }

            fs.writeFileSync(sessionFile, sessionString, 'utf8');
            console.log(`Sesi disimpan di ${sessionFile}`);
            accounts.set(sanitizedPhone, client);
            break; // keluar dari loop setelah berhasil login

        } catch (error) {
            console.error("Gagal login:", error.message);
            console.log("Mencoba lagi untuk mendapatkan QR code baru...");
        }
    }
}

// Fungsi untuk login menggunakan file sesi
async function loginWithSessionFile() {
    const sessionFolder = 'sessions';

    if (!fs.existsSync(sessionFolder) || fs.readdirSync(sessionFolder).length === 0) {
        console.log('Tidak ada file sesi yang ditemukan.');
        return;
    }

    const sessionFiles = fs.readdirSync(sessionFolder).filter(file => file.endsWith('.session'));

    console.log(`Total file sesi: ${sessionFiles.length}`);
    
    let counter = 1; // Inisialisasi counter untuk penomoran
    for (const file of sessionFiles) {
        console.log(`${counter}/${sessionFiles.length} | ${file}`);
        await handleSessionFile(file);
        counter++;
    }
}

async function handleSessionFile(selectedFile) {
    const sessionFolder = 'sessions';
    const sessionData = fs.readFileSync(path.join(sessionFolder, selectedFile), 'utf8');

    if (!sessionData || sessionData.trim() === '') {
        console.log(`File sesi ${selectedFile} kosong atau tidak valid.`);
        return;
    }

    try {
        const client = new TelegramClient(new StringSession(sessionData), apiId, apiHash, { connectionRetries: 5, baseLogger: logger2 });
        await client.start({ onError: (error) => console.error("Koneksi gagal, mencoba lagi") });
        const phone = selectedFile.replace('.session', '');
        accounts.set(phone, client);
    } catch (error) {
        console.error(`Gagal login ${selectedFile}:`, error.message);
    }
}


// Fungsi untuk meminta WebView untuk klien
async function requestWebViewForClient(client, phoneNumber, botPeer, url) {
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
        const urlObject = decodeURIComponent(result.url);
        const cekFilePath = 'cek.txt';
        fs.writeFileSync(cekFilePath, JSON.stringify(urlObject, null, 2)); // Simpan hasil sebagai JSON

        return { phoneNumber, webAppData };
    } catch (error) {
        console.error("Error saat meminta WebView:", error);
        return null;
    }
}

// Fungsi untuk meminta WebView untuk semua klien
async function requestWebViewForAllClients() {
    if (accounts.size === 0) {
        console.log('Tidak ada akun yang masuk.');
        return;
    }

    const botPeer = await askQuestion("Silakan masukkan bot peer (misalnya, @YourBot): ");
    const url = await askQuestion("Silakan masukkan URL WebView: ");
    const latestResults = [];
    const webviewFolder = 'webview_results';

    for (const [phoneNumber, client] of accounts.entries()) {
        console.log(`Memproses akun: ${phoneNumber}`);
        const result = await requestWebViewForClient(client, phoneNumber, botPeer, url);
        if (result) {
            latestResults.push(result);
            const sanitizedPhone = phoneNumber.replace(/\D/g, '');
            const resultFile = path.join(webviewFolder, `${sanitizedPhone}.txt`);

            if (!fs.existsSync(webviewFolder)) {
                fs.mkdirSync(webviewFolder, { recursive: true });
            }

            let fileContent = '';
            if (fs.existsSync(resultFile)) {
                fileContent = fs.readFileSync(resultFile, 'utf8');
                const filteredContent = fileContent
                    .split('\n')
                    .filter(line => !line.startsWith(`Bot: ${botPeer} | WebAppData:`))
                    .join('\n');
                fs.writeFileSync(resultFile, filteredContent, 'utf8');
            }

            fs.writeFileSync(resultFile, `Bot: ${botPeer} | WebAppData: ${result.webAppData}\n`, { flag: 'a' });
        }
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

// Fungsi utama untuk menangani input pengguna
async function main() {
    console.log('Selamat datang di Utilitas Bot Telegram!');
    console.log(intro);

    while (true) {
        console.log('1. Login dengan nomor telepon');
        console.log('2. Login dengan QR Code');
        console.log('3. Login dengan file sesi');
        console.log('4. Kirim WebView untuk semua klien');
        console.log('5. exit');

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
                await requestWebViewForAllClients();
                break;
            case '5':
                process.exit();
            default:
                console.log("Pilihan tidak valid.");
        }
    }
}

main().catch(console.error);
