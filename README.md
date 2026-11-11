# ขุมทรัพย์แห่งแอนดีส

เกมเว็บภาษาไทยสำหรับผู้เล่น 3–8 คน เล่น 5 รอบในห้องที่เข้าด้วยลิงก์หรือรหัส โดยใช้ชื่อเล่น

## เล่นบนเครื่อง

ติดตั้ง Node.js 22 ขึ้นไป เปิดเทอร์มินัลในโฟลเดอร์นี้ แล้วใช้คำสั่งต่อไปนี้ โปรเจกต์ใช้เฉพาะโมดูลที่มากับ Node.js

```sh
node server.mjs
```

เปิด http://127.0.0.1:3000 เพื่อเข้า Hub แล้วเลือก Incan Gold เพื่อสร้างห้อง หากทดสอบบนเครื่องเดียว ให้เปิดลิงก์เชิญในเบราว์เซอร์หรือโปรไฟล์แยกกัน เพราะแท็บที่ใช้โปรไฟล์เดียวกันจะจำที่นั่งเดียวกัน

```sh
node --test
```

## โครงสร้างโปรเจกต์

- `server.mjs` จุดเริ่มต้นของเซิร์ฟเวอร์และ API ห้องเกม
- `src/` กติกาและสถานะเกม
- `public/` หน้าเว็บและไฟล์ที่เบราว์เซอร์ใช้ ภาพการ์ดที่แสดงในเกมฝังอยู่ใน `public/app.js`
- `test/` ชุดทดสอบเกมและ API
- `archive/` ไฟล์ภาพต้นฉบับ ภาพครอป และ ZIP สำหรับเก็บไว้ในเครื่อง Git จะข้ามโฟลเดอร์นี้

หน้าเลือกเกมอยู่ที่ `/` (`public/hub.html`) ส่วน Incan Gold อยู่ที่ `/games/incan-gold` (`public/index.html`) เมื่อต้องการเพิ่มเกม ให้เพิ่มเส้นทางของเกมใน `server.mjs` และการ์ดเกมในหน้า Hub

## เผยแพร่ผ่าน GitHub และ Render Free

1. สร้าง repository เปล่าบน GitHub แล้วรันจากโฟลเดอร์โปรเจกต์ แทนที่ `YOUR-USER` และ `YOUR-REPO` ด้วยชื่อจริง

   ```sh
   git init -b main
   git add .
   git commit -m "Add Incan Gold web game"
   git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
   git push -u origin main
   ```

2. เข้า [Render Dashboard](https://dashboard.render.com/) เลือก **New → Web Service** เชื่อมบัญชี GitHub แล้วเลือก repository จากรายการที่เชื่อมไว้ การวาง URL แบบ **Public Git Repository** จะใช้ Auto-Deploy ไม่ได้ [วิธีเชื่อม GitHub กับ Render](https://render.com/docs/web-services)
3. ตั้งค่าตามตารางแล้วกด **Deploy Web Service**

   | ค่าใน Render | ค่าที่ใช้ |
   |---|---|
   | Branch | `main` |
   | Root Directory | เว้นว่าง |
   | Runtime | Node (22 ขึ้นไป) |
   | Build Command | `node --test` |
   | Start Command | `npm start` |
   | Instance Type | Free |
   | Auto-Deploy | On Commit |

4. เมื่อสถานะขึ้น **Live** เปิด URL `onrender.com` ที่ Render ให้มาเพื่อเข้า Hub เลือก **เข้าเล่น Incan Gold** สร้างห้องแล้วกด **คัดลอกลิงก์เชิญ** ลองให้เพื่อนเข้าจากอีกเครือข่าย
5. หลังแก้เกม ให้ทดสอบด้วย `node --test` แล้ว commit และ push เข้า `main` Render จะทดสอบและเผยแพร่จาก branch นี้อัตโนมัติ ผู้เล่นใช้ URL เดิม [Render Auto-Deploy](https://render.com/docs/deploys)

แอปอ่าน `PORT` จาก Render และใช้เซิร์ฟเวอร์หนึ่ง instance แผน Free จะพักเมื่อไม่มีคนเข้า 15 นาที คนแรกที่เปิดอาจรอประมาณ 1 นาที ห้องที่กำลังเล่นจะหายเมื่อเซิร์ฟเวอร์พัก รีสตาร์ต หรือ deploy เพราะสถานะห้องอยู่ในหน่วยความจำ [ข้อจำกัดของ Render Free](https://render.com/docs/free)

เกมซิงก์ผ่าน HTTP ทุก 700 มิลลิวินาที ห้องอยู่ในหน่วยความจำของเซิร์ฟเวอร์หนึ่ง instance และจะหายเมื่อรีสตาร์ตหรือไม่มีคำขอเข้าห้องเป็นเวลาหนึ่งชั่วโมง ผู้เล่นกลับเข้าที่นั่งเดิมได้จากเบราว์เซอร์เดิมตราบใดที่ห้องยังอยู่

## กติกาและภาพ

ใช้ [คู่มือเกมหลักฉบับ 2024](https://drive.google.com/file/d/1g9iStN6y5m0VZFrQFYN3a2RFztps4W6s/view) จาก [Eagle-Gryphon Games](https://www.eagle-gryphon.com/products/incan-gold-2024) เกมเว็บเพิ่มเวลาเลือก 45 วินาที แล้วพาผู้ที่ยังไม่ได้เลือกกลับแคมป์ เมื่อเจ้าของห้องหลุดเกิน 45 วินาที ระบบให้สิทธิ์เจ้าของห้องแก่ผู้เล่นที่ออนไลน์

- `machu.jpg` [Machu Picchu โดย W. Bulach](https://commons.wikimedia.org/wiki/File:00_1596_Ruinenstadt_Machu_Picchu.jpg) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) · ใช้ภาพย่อและจัดครอปด้วย CSS
- `artifact.jpg` [Female figurine จาก The Metropolitan Museum of Art](https://commons.wikimedia.org/wiki/File:Female_figurine_MET_LC-1979_206_1058-image_4.jpg) · [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) · จัดครอปด้วย CSS
- `gold.jpg` [Native gold nuggets โดย Aram Dulyan](https://commons.wikimedia.org/wiki/File:Native_gold_nuggets.jpg) · สาธารณสมบัติ · จัดครอปด้วย CSS
