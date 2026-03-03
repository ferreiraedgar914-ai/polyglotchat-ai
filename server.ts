import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = process.env.PORT || 3000;

  // In-memory state for the demo
  const messages: any[] = [];
  const allUsers = new Map(); // Key: name, Value: { name, lang, lastSeen, isOnline, socketId }

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join", (userData) => {
      const updatedUser = {
        ...userData,
        isOnline: true,
        socketId: socket.id,
        lastSeen: new Date().toISOString()
      };
      
      allUsers.set(userData.name, updatedUser);
      
      socket.emit("previous_messages", messages);
      io.emit("user_list", Array.from(allUsers.values()));
    });

    socket.on("send_message", (messageData) => {
      // Find user name by socketId to ensure correct sender name
      let senderName = "Anonymous";
      for (const user of allUsers.values()) {
        if (user.socketId === socket.id) {
          senderName = user.name;
          break;
        }
      }

      const newMessage = {
        ...messageData,
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        senderId: socket.id,
        senderName: senderName
      };
      messages.push(newMessage);
      // Keep only last 100 messages
      if (messages.length > 100) messages.shift();
      
      io.emit("new_message", newMessage);
    });

    socket.on("delete_message", (messageId) => {
      const index = messages.findIndex(m => m.id === messageId);
      if (index !== -1) {
        // Security check: only the sender can delete the message
        if (messages[index].senderId === socket.id) {
          messages.splice(index, 1);
          io.emit("message_deleted", messageId);
        }
      }
    });

    socket.on("edit_message", ({ messageId, newText }) => {
      const index = messages.findIndex(m => m.id === messageId);
      if (index !== -1) {
        // Security check: only the sender can edit the message
        if (messages[index].senderId === socket.id) {
          messages[index].text = newText;
          messages[index].isEdited = true;
          // Clear translation if it was edited
          delete messages[index].translatedText;
          io.emit("message_edited", { messageId, newText });
        }
      }
    });

    socket.on("react_to_message", ({ messageId, emoji }) => {
      const index = messages.findIndex(m => m.id === messageId);
      if (index !== -1) {
        const message = messages[index];
        if (!message.reactions) {
          message.reactions = {};
        }
        if (!message.reactions[emoji]) {
          message.reactions[emoji] = [];
        }
        
        const userIndex = message.reactions[emoji].indexOf(socket.id);
        if (userIndex === -1) {
          message.reactions[emoji].push(socket.id);
        } else {
          message.reactions[emoji].splice(userIndex, 1);
          if (message.reactions[emoji].length === 0) {
            delete message.reactions[emoji];
          }
        }
        
        io.emit("message_reacted", { messageId, reactions: message.reactions });
      }
    });

    socket.on("typing", (isTyping) => {
      const user = Array.from(allUsers.values()).find(u => u.socketId === socket.id);
      if (user) {
        socket.broadcast.emit("user_typing", { name: user.name, isTyping });
      }
    });

    socket.on("disconnect", () => {
      // Find user by socketId
      for (const [name, user] of allUsers.entries()) {
        if (user.socketId === socket.id) {
          allUsers.set(name, { ...user, isOnline: false, lastSeen: new Date().toISOString() });
          break;
        }
      }
      io.emit("user_list", Array.from(allUsers.values()));
      console.log("User disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();