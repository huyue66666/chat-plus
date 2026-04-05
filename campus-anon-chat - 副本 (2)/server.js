const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('@replit/database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const db = new Database();

const rooms = {};           // 在线用户
let roomMessages = {};      // 云端消息 {room: [{id, nickname, gender, text, timestamp, parentId}] }

app.use(express.static('public'));

const genderMap = { male: '♂', female: '♀', other: '⚪' };

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  socket.on('joinRoom', async ({ room, nickname, password, gender }) => {
    if (room === 'JSU' && password !== '123456') {
      socket.emit('error', '校园邀请码错误！');
      return;
    }

    socket.join(room);
    socket.room = room;
    socket.nickname = nickname || '匿名用户' + Math.floor(Math.random() * 1000);
    socket.gender = gender || 'other';

    if (!rooms[room]) rooms[room] = [];
    rooms[room].push({ id: socket.id, nickname: socket.nickname, gender: socket.gender });

    // 加载云端历史消息
    if (!roomMessages[room]) {
      const saved = await db.get(`messages_${room}`) || [];
      roomMessages[room] = saved;
    }
    socket.emit('loadMessages', roomMessages[room]);

    io.to(room).emit('userList', rooms[room]);
    socket.emit('joined', { nickname: socket.nickname, room, gender: socket.gender });
    io.to(room).emit('message', {
      type: 'system',
      text: `\( {genderMap[socket.gender]} \){socket.nickname} 加入了聊天室`
    });
  });

  // 公开聊天（支持回复线程）
  socket.on('chatMessage', async (data) => {
    if (!socket.room) return;
    const msg = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
      nickname: socket.nickname,
      gender: socket.gender,
      text: data.text,
      timestamp: new Date().toLocaleTimeString('zh-CN'),
      parentId: data.parentId || null
    };

    if (!roomMessages[socket.room]) roomMessages[socket.room] = [];
    roomMessages[socket.room].push(msg);

    // 保存到云端
    await db.set(`messages_${socket.room}`, roomMessages[socket.room]);

    io.to(socket.room).emit('message', msg);
  });

  // 私聊
  socket.on('privateMessage', ({ targetId, text }) => {
    const privateMsg = {
      fromNickname: socket.nickname,
      fromGender: socket.gender,
      text,
      timestamp: new Date().toLocaleTimeString('zh-CN')
    };
    io.to(targetId).emit('privateMessageReceived', privateMsg);
    socket.emit('privateMessageSent', { toId: targetId, ...privateMsg });
  });

  socket.on('disconnect', () => {
    if (socket.room && rooms[socket.room]) {
      rooms[socket.room] = rooms[socket.room].filter(u => u.id !== socket.id);
      io.to(socket.room).emit('userList', rooms[socket.room]);
      io.to(socket.room).emit('message', {
        type: 'system',
        text: `\( {genderMap[socket.gender]} \){socket.nickname} 离开了聊天室`
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 匿名校园聊天室已部署在云服务器！`));