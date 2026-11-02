# Calisthenics Tracker

Pencatat latihan calisthenics mingguan untuk satu pengguna. Aplikasi berjalan sepenuhnya di browser, tanpa backend, login, framework, atau langkah build.

## Fitur

- Jadwal otomatis: Senin (Tarik & Grip), Rabu (Dorong & Kaki), Kamis (Full Body), Sabtu (Jogging), Minggu/istirahat.
- Selasa dan Jumat tidak dijadwalkan, jadi aplikasi menampilkannya sebagai hari istirahat.
- Pencatatan set, reps/durasi, catatan, dan gerakan yang dilewati.
- Timer istirahat 30–120 detik.
- Riwayat sesi dan jogging.
- Saran naik level berbasis aturan dari 2 sesi terakhir.
- Grafik progres SVG untuk setiap gerakan.
- Panel Target Pull-up.
- Export/import backup JSON dan hapus semua data.

## Membuka secara lokal

Pilihan paling sederhana: buka `index.html` langsung di browser.

Jika browser membatasi `localStorage` pada alamat `file://`, jalankan server statis dari folder proyek:

```bash
python3 -m http.server 8000
```

Lalu buka <http://localhost:8000>.

Tidak ada `npm install` atau proses build.

## Hosting di GitHub Pages

1. Buat repositori GitHub, lalu push seluruh isi folder ini ke branch `main`.
2. Buka **Settings → Pages** pada repositori.
3. Pada **Build and deployment**, pilih **Deploy from a branch**.
4. Pilih branch `main` dan folder `/ (root)`, lalu simpan.
5. Tunggu proses deploy. Situs akan tersedia di `https://<username>.github.io/<nama-repo>/`.

Semua path bersifat relatif, jadi aplikasi bisa langsung berjalan dari GitHub Pages.

## Data dan backup

- Data disimpan di `localStorage` browser dengan kunci `calistenics.v1`.
- Data hanya ada di browser/perangkat yang digunakan. Tidak ada sinkronisasi otomatis.
- Lakukan **Export Data** secara rutin dari halaman Pengaturan. File backup bernama `calisthenics-backup-YYYY-MM-DD.json`.
- **Import Data** menggantikan seluruh data lama setelah konfirmasi.
- **Hapus Semua Data** memerlukan dua konfirmasi.
- Jika versi data tidak cocok, aplikasi menampilkan pesan dan tidak menimpa data lama secara otomatis.

## Mengubah program

Semua definisi program dan angka aturan ada di `data.js`:

- `schedule` — hari latihan dan daftar gerakan.
- `exercises` — jumlah set, target awal, tipe reps/durasi, dan kenaikan level.
- `rules` — jumlah sesi minimum, pengurangan target saat gagal, timer istirahat, dan aturan jogging.
- `safetyNotes` — catatan keamanan di halaman Hari Ini.
- `exerciseOrder` — urutan gerakan pada halaman Progres. Tambahkan key gerakan baru di sini agar muncul di pemilih grafik.

Logika aplikasi ada di `app.js`, tampilan di `index.html` dan `style.css`.

Saran level dihitung dari 2 sesi terakhir untuk gerakan yang sama. Setelah sebuah saran diterima, target aktif disimpan di `levels` dan saran berikutnya baru dihitung dari sesi-sesi setelah perubahan target tersebut.

## Struktur file

```text
/
├── index.html   # Halaman utama
├── style.css    # Styling mobile first + dark mode
├── app.js       # Logika aplikasi
├── data.js      # Program latihan dan aturan naik level
├── README.md
└── PRD.md
```

## Catatan

- Target browser: Chrome, Safari, dan Firefox versi terbaru.
- Tidak ada request ke server selain memuat file statis.
- Tidak ada data pribadi yang disimpan selain catatan latihan.
