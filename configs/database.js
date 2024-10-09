const { Sequelize } = require('sequelize');
const osPaths = require('os-paths/cjs');
const pathRoot = osPaths.home() + "\\.gemFamer";
// Tạo kết nối với SQLite
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage:  '.\\db.db',
    username: "gemlogin",
    password: "dKlM@4r%",
   // logging: false
  });

// Kiểm tra kết nối
async function testConnection() {
    try {
        await sequelize.authenticate();
        console.log('Kết nối thành công!');
    } catch (error) {
        console.error('Không thể kết nối:', error);
    }
}

testConnection();


module.exports = sequelize;
