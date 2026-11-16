/* ที่อยู่ระบบข้อมูล (Apps Script Web App ลงท้าย /exec) และเลขเวอร์ชันหน้าเว็บ
   - เว้นว่าง CID_API = ใช้แบบเดิม (เก็บข้อมูลในเบราว์เซอร์เครื่องนั้น)
   - ใส่ URL /exec แล้ว = ทุกเครื่องเห็นข้อมูลชุดเดียวกันจาก Google Sheet
   เมื่อแก้ไฟล์หน้าเว็บ ให้เพิ่มเลข CID_V เพื่อล้างแคชของผู้ชม */
window.CID_API = 'https://script.google.com/macros/s/AKfycby2PHg5fWR698JbJtMRjY-6Va3-YSLIqHDM8ANInHhLpqyBETRNEpSs6V4Bn8Ww2XG4/exec';
window.CID_V = 5;
