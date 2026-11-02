# PRD: Calisthenics Tracker

Versi: 1.0
Status: Siap dikerjakan
Pemilik: Ghofur (pengguna tunggal)

---

## 1. Ringkasan

Website sederhana untuk mencatat latihan calisthenics 3x seminggu, melihat jadwal hari ini, dan mendapat saran naik level otomatis berdasarkan hasil latihan. Website berjalan sepenuhnya di browser dan bisa di-hosting di GitHub Pages.

## 2. Tujuan

- Tahu latihan apa yang harus dilakukan hari ini tanpa membuka catatan lain.
- Mencatat set, reps, dan durasi setiap sesi dengan cepat (kurang dari 1 menit per sesi).
- Mendapat saran naik level yang jelas dan konsisten.
- Melacak progres menuju pull-up pertama.
- Mencatat jogging sebagai latihan kardio hari Sabtu.

## 3. Pengguna

Satu orang: pemula calisthenics. Pengguna memakai HP saat latihan di rumah. Tidak ada login, tidak ada akun, tidak ada banyak pengguna.

## 4. Ruang Lingkup

### Termasuk
- Jadwal mingguan tetap (Senin, Rabu, Kamis latihan kekuatan; Sabtu jogging; Minggu libur).
- Pencatatan sesi dan jogging.
- Saran naik level berbasis aturan (rule-based).
- Riwayat dan grafik sederhana.
- Export dan import data dalam bentuk file JSON.

### Tidak termasuk
- Backend, database server, atau API.
- Login, akun, atau sinkronisasi antar perangkat.
- Framework (React, Vue, Angular, dll.) dan build tool (Webpack, Vite, npm untuk runtime).
- Library pihak ketiga selain yang disebut di bagian 5.
- AI atau rekomendasi berbasis model. Saran naik level hanya aturan tetap.
- Notifikasi pengingat.

## 5. Teknologi

- HTML5, CSS3, dan JavaScript vanilla (ES2020 ke atas).
- Penyimpanan: `localStorage` browser.
- Grafik: SVG atau canvas buatan sendiri. Tanpa library chart.
- Hosting: GitHub Pages dari branch `main`, folder root.
- Tanpa langkah build. Semua file bisa dibuka langsung di browser.

## 6. Struktur File

```
/
├── index.html      # Halaman utama (semua view dalam satu halaman)
├── style.css       # Styling, mobile first
├── app.js          # Logika aplikasi
├── data.js         # Definisi program latihan dan aturan naik level
├── README.md       # Cara buka dan hosting
└── PRD.md          # Dokumen ini
```

## 7. Program Latihan (Data Awal)

### Senin: Tarik & Grip
| No | Gerakan | Set | Target awal | Tipe |
|----|---------|-----|-------------|------|
| 1 | Dead hang | 3 | 15–20 detik | durasi |
| 2 | Negative pull-up | 3 | 3 reps, turun 3–5 detik | reps |
| 3 | Scapula pull | 3 | 8 reps | reps |
| 4 | Farmer hold | 2 | 30 detik | durasi |
| 5 | Wrist curl | 2 | 15 reps | reps |

### Rabu: Dorong & Kaki
| No | Gerakan | Set | Target awal | Tipe |
|----|---------|-----|-------------|------|
| 1 | Incline push-up | 3 | 8–10 reps | reps |
| 2 | Squat badan sendiri | 3 | 12 reps | reps |
| 3 | Glute bridge | 3 | 12 reps | reps |
| 4 | Reverse lunge | 2 | 8 reps tiap kaki | reps |
| 5 | Plank | 3 | 20 detik | durasi |
| 6 | Calf raise | 3 | 15 reps | reps |

### Kamis: Full Body
| No | Gerakan | Set | Target awal | Tipe |
|----|---------|-----|-------------|------|
| 1 | Negative pull-up atau dead hang | 3 | 3 reps | reps |
| 2 | Push-up (incline atau lantai) | 3 | sebanyak bisa | reps |
| 3 | Split squat | 3 | 8 reps tiap kaki | reps |
| 4 | Dead bug | 3 | 8 reps tiap sisi | reps |
| 5 | Farmer hold | 2 | 30 detik | durasi |

> Catatan: Jadwal Senin, Rabu, Kamis mengikuti jadwal kuliah. Hari bisa diubah di `data.js`.

### Sabtu: Jogging
- Format: interval jalan dan lari.
- Mulai: jalan 1 menit, lari 1 menit, ulang 10 kali (total 20 menit).
- Data yang dicatat: durasi total, jumlah interval, catatan bebas.

### Minggu: Libur
- Tidak ada sesi. Tampilkan pesan "Istirahat".

## 8. Fitur

### F1. Halaman Hari Ini
- Menampilkan sesi sesuai hari berjalan.
- Jika hari libur, tampilkan pesan istirahat dan sesi berikutnya.
- Tombol "Mulai Sesi".

### F2. Pencatatan Sesi
- Daftar gerakan dengan checklist per set.
- Input untuk setiap set: reps atau durasi (detik), sesuai tipe gerakan.
- Tombol "Selesai" menyimpan sesi dengan tanggal dan waktu.
- Timer istirahat sederhana (default 60 detik, bisa diatur 30–120 detik).
- Bisa menandai gerakan "dilewati" dengan alasan singkat.

### F3. Riwayat
- Daftar semua sesi, urut dari terbaru.
- Klik satu sesi untuk melihat detail.
- Bisa menghapus satu sesi (dengan konfirmasi).

### F4. Saran Naik Level
- Muncul di halaman Hari Ini dan di detail tiap gerakan.
- Dihitung dari riwayat 2 sesi terakhir untuk gerakan yang sama (lihat bagian 9).
- Saran hanya berupa teks dan angka. Pengguna memutuskan sendiri apakah menerimanya.

### F5. Progres
- Grafik sederhana per gerakan: nilai maksimal per sesi, 8 sesi terakhir.
- Panel khusus "Target Pull-up": tampilkan negative pull-up terbaik, dead hang terbaik, dan apakah sudah ada pull-up penuh.

### F6. Jogging
- Form input: tanggal, durasi total, jumlah interval, catatan.
- Riwayat jogging dalam daftar terpisah.

### F7. Backup
- Export semua data ke file `calisthenics-backup-YYYY-MM-DD.json`.
- Import dari file JSON. Data impor menggantikan data lama setelah konfirmasi.
- Tombol "Hapus Semua Data" dengan konfirmasi dua kali.

## 9. Aturan Naik Level

Aturan dihitung per gerakan dari 2 sesi terakhir yang memuat gerakan itu.

| Gerakan | Tipe | Kondisi naik level | Aksi saran |
|---------|------|--------------------|------------|
| Dead hang | durasi | Semua set mencapai target durasi di 2 sesi berturut-turut | Tambah 5 detik |
| Negative pull-up | reps | Semua set 5 reps dengan turun ≥ 5 detik | Tambah durasi turun 2 detik, atau tampilkan saran "coba 1 pull-up penuh" |
| Scapula pull | reps | Semua set mencapai target di 2 sesi | Tambah 2 reps |
| Incline push-up | reps | Semua set mencapai target di 2 sesi | Turunkan sudut (tinggi meja/kursi), reset ke target awal |
| Push-up lantai | reps | Semua set mencapai 10 reps di 2 sesi | Tambah 2 reps |
| Squat, glute bridge, split squat, reverse lunge, calf raise | reps | Semua set mencapai target di 2 sesi | Tambah 2 reps per set |
| Plank, farmer hold, wrist curl | durasi/reps | Semua set mencapai target di 2 sesi | Tambah 5 detik atau 2 reps |
| Dead bug | reps | Semua set mencapai target di 2 sesi | Tambah 2 reps |
| Jogging | interval | Selesai 20 menit tanpa berhenti (jalan atau lari) di 2 sesi | Tambah 1 interval lari (ubah 1 menit jalan jadi 1 menit lari) |

Aturan lainnya:
- Jika gagal (set tidak mencapai target) di 2 sesi berturut-turut: saran "pertahankan level, istirahat 1 minggu" atau "turunkan target 10%".
- Saran naik level jangan muncul sebelum ada minimal 2 sesi untuk gerakan itu.
- Semua angka aturan disimpan di `data.js`, bukan di logika `app.js`, supaya mudah diubah.

## 10. Model Data

Disimpan di `localStorage` dengan kunci `calistenics.v1`.

```json
{
  "version": 1,
  "sessions": [
    {
      "id": "2026-11-02T19:10:00Z-senin",
      "date": "2026-11-02",
      "day": "senin",
      "startedAt": "2026-11-02T19:10:00Z",
      "finishedAt": "2026-11-02T19:52:00Z",
      "exercises": [
        {
          "key": "dead-hang",
          "sets": [
            { "target": 15, "actual": 15, "unit": "detik", "done": true },
            { "target": 15, "actual": 12, "unit": "detik", "done": false }
          ],
          "skipped": false,
          "note": ""
        }
      ]
    }
  ],
  "joggingLog": [
    { "id": "...", "date": "2026-11-08", "durationMin": 20, "intervals": 10, "note": "" }
  ],
  "settings": { "restSeconds": 60 },
  "levels": { "dead-hang": { "target": 15 } }
}
```

- `levels` menyimpan target aktif per gerakan. Diperbarui saat pengguna menerima saran.
- Jika `version` tidak cocok saat load, tampilkan pesan dan jangan menimpa data.

## 11. UI dan UX

- Mobile first. Layout satu kolom, tombol besar (minimal 44 px).
- Dark mode mengikuti sistem (`prefers-color-scheme`).
- Bahasa: Indonesia.
- Navigasi bawah dengan 4 tab: Hari Ini, Riwayat, Progres, Pengaturan.
- Tidak ada animasi berat. Transisi maksimal 150 ms.
- Teks saran naik level ditulis singkat, satu kalimat.

## 12. Persyaratan Non-Fungsional

- Berjalan di Chrome, Safari, dan Firefox versi terbaru.
- Tidak ada request ke server selain memuat file statis.
- Ukuran total file di bawah 300 KB.
- Bisa dibuka offline setelah pertama kali dimuat (opsional: service worker sederhana).
- Tidak menyimpan data pribadi selain catatan latihan.

## 13. Kriteria Penerimaan

1. Pada hari Senin, Rabu, Kamis, halaman Hari Ini menampilkan sesi yang benar.
2. Pada hari Sabtu, halaman Hari Ini menampilkan form jogging.
3. Pada hari Minggu, halaman Hari Ini menampilkan pesan istirahat.
4. Pengguna bisa menyelesaikan satu sesi penuh dan data tersimpan setelah halaman di-refresh.
5. Setelah 2 sesi berturut-turut dengan semua set tercapai untuk dead hang, saran "tambah 5 detik" muncul.
6. Export lalu import data menghasilkan data yang sama.
7. Hapus semua data memerlukan konfirmasi dua kali.
8. Website berjalan dari GitHub Pages tanpa error di console.

## 14. Langkah Pengerjaan (untuk AI agent)

1. Buat struktur file sesuai bagian 6.
2. Isi `data.js` dengan program latihan (bagian 7) dan aturan naik level (bagian 9).
3. Buat model data dan fungsi load, save, export, import di `app.js`.
4. Buat halaman Hari Ini dan alur pencatatan sesi.
5. Buat halaman Riwayat dan detail sesi.
6. Buat logika saran naik level dan tampilkan di halaman Hari Ini.
7. Buat halaman Progres dengan grafik SVG sederhana.
8. Buat form jogging dan riwayatnya.
9. Buat Pengaturan: timer istirahat, export, import, hapus data.
10. Tulis `README.md` berisi cara buka lokal dan cara hosting di GitHub Pages.
11. Uji semua kriteria penerimaan di bagian 13.

Jangan pakai framework atau langkah build. Jangan tambah fitur di luar dokumen ini.

## 15. Risiko dan Mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Data hilang jika cache browser dihapus | Fitur export rutin. Ingatkan export di halaman Pengaturan. |
| Data beda antar HP atau browser | Gunakan import dari file backup. Sinkronisasi di luar lingkup. |
| Saran naik level terlalu cepat | Minimal 2 sesi sukses berturut-turut. Angka bisa diubah di `data.js`. |
| Pengguna melakukan gerakan salah | Tampilkan catatan keamanan di halaman Hari Ini (pull-up bar, pemanasan). |

## 16. Di Luar Lingkup (Versi 1.0)

- Pengingat atau notifikasi.
- Mode gym (gerakan berbeda untuk gym).
- Video contoh gerakan.
- Grafik beban.
- Multi pengguna.
- Integrasi kalender kuliah.
