const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/db');
const { createSystemLog } = require('./adminController');

async function register(req, res) {
  try {
    const { fullName, email, password, confirmPassword, gender, country, age, agreeTerms } = req.body;

    if (!fullName || !email || !password || !confirmPassword || !gender || !country || !age) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Mật khẩu xác nhận không khớp' });
    }

    if (!agreeTerms) {
      return res.status(400).json({ error: 'Bạn cần đồng ý điều khoản sử dụng' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email không hợp lệ' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }

    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 18 || ageNum > 100) {
      return res.status(400).json({ error: 'Tuổi phải từ 18 đến 100' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email đã được đăng ký' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: fullName,
        gender,
        country,
        age: ageNum,
        bio: null
      }
    });

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        gender: user.gender,
        country: user.country,
        age: user.age,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        coinBalance: user.coinBalance,
        role: user.role || 'user'
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }

    const now = new Date();
    if (user.isBanned) {
      if (user.bannedUntil == null || new Date(user.bannedUntil) > now) {
        return res.status(403).json({ error: 'Tài khoản đã bị khóa' });
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { isBanned: false, bannedUntil: null }
      });
      user.isBanned = false;
    }

    createSystemLog({ action: 'login', user_id: user.id }).catch(() => {});

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        gender: user.gender,
        country: user.country,
        age: user.age,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        coinBalance: user.coinBalance,
        role: user.role || 'user'
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

module.exports = { register, login };
