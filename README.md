### Langkah 1: Instal Node.js

1. **Unduh Node.js**:
   - Kunjungi [nodejs.org](https://nodejs.org/).
   - Pilih versi LTS dan ikuti instruksi instalasi.

2. **Verifikasi Instalasi**:
   - Buka terminal dan jalankan:
     ```bash
     node -v
     npm -v
     ```

### Langkah 2: Instal Git

1. **Unduh Git**:
   - Kunjungi [git-scm.com](https://git-scm.com/).
   - Unduh dan instal Git.

2. **Verifikasi Instalasi**:
   - Buka terminal dan jalankan:
     ```bash
     git --version
     ```

### Langkah 3: Clone Repository

1. **Clone Repository**:
   - Buka terminal dan jalankan:
     ```bash
     git clone https://github.com/ululazmi18/get_query_id.git
     cd get_query_id
     ```

### Langkah 4: Instal Paket yang Diperlukan

1. **Instal Paket**:
   - Pastikan Anda di dalam folder proyek dan jalankan:
     ```bash
     npm install
     ```

### Langkah 5: Konfigurasi Environment Variables

1. **Buat File `.env`**:
   - Di dalam folder proyek, buat file `.env`.
   - Tambahkan baris berikut (ganti dengan nilai Anda dari Telegram):
     ```
     API_ID=your_api_id
     API_HASH=your_api_hash
     ```

### Langkah 6: Menjalankan Skrip

1. **Jalankan Skrip**:
   - Di dalam terminal, pastikan Anda masih di folder proyek.
   - Jalankan:
     ```bash
     node index.js
     ```

Dengan langkah-langkah ini, Anda siap menggunakan skrip!
