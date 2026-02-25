const path = require('path');
const fs = require('fs');
const { prisma } = require('../config/db');

async function getProfile(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        gender: true,
        country: true,
        age: true,
        bio: true,
        avatarUrl: true
      }
    });
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }
    res.json(user);
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

async function updateProfile(req, res) {
  try {
    const { displayName, gender, country, age, bio } = req.body;

    const updateData = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (gender !== undefined) updateData.gender = gender;
    if (country !== undefined) updateData.country = country;
    if (age !== undefined) updateData.age = parseInt(age, 10);
    if (bio !== undefined) updateData.bio = bio;

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        displayName: true,
        gender: true,
        country: true,
        age: true,
        bio: true,
        avatarUrl: true
      }
    });
    res.json(user);
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

async function uploadAvatar(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Chưa chọn ảnh' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const avatarUrl = `${baseUrl}/uploads/${req.file.filename}`;

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { avatarUrl },
      select: {
        id: true,
        avatarUrl: true
      }
    });

    res.json({ avatarUrl: user.avatarUrl });
  } catch (err) {
    console.error('Upload avatar error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

module.exports = { getProfile, updateProfile, uploadAvatar };
