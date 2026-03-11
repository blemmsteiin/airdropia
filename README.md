# Airdrop & Discount Tracking App (Airdropia) 🚀✨

Airdropia is a modern React Native (Expo) mobile application designed to track the latest airdrops and discount opportunities. It features real-time chat between users and a comprehensive support ticket system.

## ✨ Features

### 🛡️ Authentication & Security
- **Unified Smart Login**: Admin and user logins are merged into a single screen. The system automatically detects your role upon login.
- **Email Verification**: Mandatory email verification for new accounts with a 1-minute cooldown for resending verification links.
- **Advanced Input Filtering**: Usernames are strictly filtered to exclude emojis, spaces, Turkish characters, and special symbols (", . -).
- **Password Strength Meter**: Real-time analysis and visual feedback on password security during registration.
- **Account Deletion**: Secure account deletion with an email blacklisting system to prevent re-registration with the same email.

### 💰 Airdrops & Deals
- **Dynamic Listings**: Specially designed cards for both airdrops and discounts.
- **Profit & Discount Badges**: Automatic color-coded badges (Green for Profit, Blue for Discount %) based on the type of deal.
- **Pro Coupon Box**: A sleek, user-friendly area for quickly copying discount codes.

### 💬 Social & Support
- **Advanced Chat System**: Live Direct Messaging (DM) between users and administrators.
- **Ticket System**: A robust support ticket module with categorized requests and per-user deletion logic.
- **Media Integration**: Full-screen image viewing and "Save to Gallery" functionality for chat and ticket images (`expo-media-library`).
- **Read Receipts**: Tracking system to show who has read a message in real-time.

### 🎨 Design & UX
- **Premium UI**: Crafted with modern typography (Inter/Outfit) and a high-end color palette.
- **Dark/Light Mode**: Dynamic theme support for a comfortable viewing experience.
- **Responsive Layout**: Fluid designs that adapt to all screen sizes, featuring KeyboardAvoidingView for seamless form interaction.

## 🚀 Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the app:
   ```bash
   npx expo start
   ```

## 🛠️ Tech Stack

- **Frontend**: React Native, Expo
- **Backend**: Firebase (Auth, Firestore)
- **Navigation**: React Navigation (Stack, Tabs)
- **Local Storage**: AsyncStorage
- **Icons**: Ionicons

---
Made with ❤️ by Airdropia Team
