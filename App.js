import React, { useState, useEffect } from 'react';
import { TouchableOpacity, ActivityIndicator, View, Alert, Text, Image } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from './src/config/firebase';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

import ActiveScreen from './src/screens/ActiveScreen';
import ChatListScreen from './src/screens/ChatListScreen';
import DiscountsScreen from './src/screens/DiscountsScreen';
import ChatDetailScreen from './src/screens/ChatDetailScreen';
import AdminLoginScreen from './src/screens/AdminLoginScreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import AirdropDetailScreen from './src/screens/AirdropDetailScreen';
import UserAuthScreen from './src/screens/UserAuthScreen';
import ProfileModal from './src/screens/ProfileModal';
import UserManagementScreen from './src/screens/UserManagementScreen';
import TicketCreateScreen from './src/screens/TicketCreateScreen';
import TicketDetailScreen from './src/screens/TicketDetailScreen';
import TicketListScreen from './src/screens/TicketListScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import PublicProfileScreen from './src/screens/PublicProfileScreen';
import HalkaArzScreen from './src/screens/HalkaArzScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs({ navigation }) {
  const { isDarkMode, toggleTheme, theme } = useTheme();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userAvatar, setUserAvatar] = useState(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [totalUnreadTickets, setTotalUnreadTickets] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setIsAdmin(false);
      return;
    }

    // Firestore'dan gerçek rolü dinle
    const unsubscribe = onSnapshot(doc(db, 'users', currentUser.uid), async (docSnap) => {
      if (docSnap.exists()) {
        const role = docSnap.data().role;
        const isActuallyAdmin = role === 'admin';
        setIsAdmin(isActuallyAdmin);
        
        // Cache'i de güncel tut ki diğer ekranlar (AsyncStorage kullananlar) senkronize olsun
        if (isActuallyAdmin) {
          await AsyncStorage.setItem('isAdmin_cache', 'true');
        } else {
          await AsyncStorage.removeItem('isAdmin_cache');
        }
      } else {
        setIsAdmin(false);
        await AsyncStorage.removeItem('isAdmin_cache');
      }
    }, (err) => {
      console.log("Firestore Admin Snapshot Error:", err);
      setIsAdmin(false);
    });

    return () => unsubscribe();
  }, [navigation]);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const unsubscribe = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
      if (docSnap.exists()) {
        setUserAvatar(docSnap.data().avatar || null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let count = 0;
      snapshot.forEach(d => {
        const data = d.data();
        if (data.unreadBy === currentUser.uid) {
          count += (data.unreadCount || 1);
        }
      });
      setTotalUnread(count);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    
    // Adminler "admin" unreadBy, üyeler kendi UID'lerini dinler
    const unreadTarget = isAdmin ? 'admin' : currentUser.uid;
    const qTickets = query(
      collection(db, 'tickets'),
      where('unreadBy', '==', unreadTarget)
    );
    const unsubscribe = onSnapshot(qTickets, (snapshot) => {
      let count = 0;
      snapshot.forEach(d => {
        const data = d.data();
        if (isAdmin && data.deletedForAdmin) return;
        if (!isAdmin && data.deletedForUser) return;
        
        if (data.unreadBy === unreadTarget) {
          count += (data.unreadCount || 1);
        }
      });
      setTotalUnreadTickets(count);
    });
    return () => unsubscribe();
  }, [isAdmin]);

  // Bildirim dinleyici
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    
    const qNotifs = query(
      collection(db, 'notifications'),
      where('recipientId', '==', currentUser.uid),
      where('read', '==', false)
    );
    const unsubscribe = onSnapshot(qNotifs, (snapshot) => {
      setUnreadNotifications(snapshot.docs.length);
    });
    return () => unsubscribe();
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Airdroplar') {
            iconName = focused ? 'rocket' : 'rocket-outline';
          } else if (route.name === 'Mesajlar') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'Halka Arz') {
            iconName = focused ? 'trending-up' : 'trending-up-outline';
          } else if (route.name === 'İndirimler') {
            iconName = focused ? 'pricetags' : 'pricetags-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.primary,
        tabInactiveTintColor: 'gray',
        headerLeft: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity 
              style={{ marginLeft: 16 }}
              onPress={() => navigation.navigate('ProfileModal')}
            >
              {userAvatar ? (
                <Image source={{ uri: userAvatar }} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: theme.border }} />
              ) : (
                <Ionicons name="person-circle-outline" size={32} color={theme.text} />
              )}
            </TouchableOpacity>
            
            {/* Sadece Yönetici İse Solda Tema Butonu */}
            {isAdmin && (
              <TouchableOpacity onPress={toggleTheme} style={{ marginLeft: 16 }}>
                <Ionicons name={isDarkMode ? "sunny" : "moon"} size={24} color={theme.text} />
              </TouchableOpacity>
            )}
          </View>
        ),
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
            {/* Yönetici Değilse Sağda Tema Butonu */}
            {!isAdmin && (
              <TouchableOpacity onPress={toggleTheme} style={{ marginRight: 16 }}>
                <Ionicons 
                  name={isDarkMode ? "sunny" : "moon"} 
                  size={24} 
                  color={theme.text} 
                />
              </TouchableOpacity>
            )}

            {isAdmin && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity 
                  onPress={() => navigation.navigate('UserManagement')}
                  style={{ marginRight: 12 }}
                >
                  <Ionicons name="people-outline" size={24} color={theme.text} />
                </TouchableOpacity>
                <TouchableOpacity  
                  onPress={() => navigation.navigate('AdminDashboard')}
                >
                  <Ionicons name="add-circle-outline" size={26} color={theme.text} />
                </TouchableOpacity>
              </View>
            )}
            
            <TouchableOpacity 
              style={{ marginLeft: 16, position: 'relative' }}
              onPress={() => navigation.navigate('Notifications')}
            >
              <Ionicons name="notifications-outline" size={24} color={theme.text} />
              {unreadNotifications > 0 && (
                <View style={{
                  position: 'absolute',
                  right: -4,
                  top: -4,
                  backgroundColor: '#FF3B30',
                  borderRadius: 8,
                  width: 16,
                  height: 16,
                  justifyContent: 'center',
                  alignItems: 'center'
                }}>
                  <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        ),
        headerStyle: {
          backgroundColor: theme.tabBar,
        },
        headerTitleStyle: {
          fontWeight: 'bold',
          color: theme.text,
        },
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.border,
          paddingBottom: 5,
          paddingTop: 5,
        }
      })}
    >
      <Tab.Screen name="Airdroplar" component={ActiveScreen} options={{ title: 'Airdroplar' }} />
      <Tab.Screen name="Mesajlar" component={ChatListScreen} options={{ 
        title: 'Mesajlar',
        tabBarBadge: (totalUnread + totalUnreadTickets) > 0 ? (totalUnread + totalUnreadTickets) : undefined,
        tabBarBadgeStyle: { 
          backgroundColor: '#FF3B30', 
          fontSize: 11 
        }
      }} />
      <Tab.Screen name="İndirimler" component={DiscountsScreen} options={{ title: 'İndirimler' }} />
      <Tab.Screen name="Halka Arz" component={HalkaArzScreen} options={{ title: 'Halka Arz' }} />
    </Tab.Navigator>
  );
}

function AppNavigation({ user }) {
  const { isDarkMode, theme } = useTheme();

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={isDarkMode ? DarkTheme : DefaultTheme}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: theme.card },
            headerTitleStyle: { color: theme.text },
            headerTintColor: theme.primary,
            headerBackTitle: 'Anasayfa',
          }}
        >
          {user ? (
            <>
              {/* Kullanıcı Giriş Yapmışsa Ana Ekranları Göster */}
              <Stack.Screen 
                name="Main" 
                component={MainTabs} 
                options={{ headerShown: false }} 
              />
              <Stack.Screen 
                name="AdminDashboard" 
                component={AdminDashboardScreen} 
                options={{ title: 'Yönetici Paneli' }} 
              />
              <Stack.Screen 
                name="AirdropDetail" 
                component={AirdropDetailScreen} 
                options={{ title: 'Airdrop Detayı' }} 
              />
              <Stack.Screen 
                name="ChatDetail" 
                component={ChatDetailScreen} 
                // Header title will be set dynamically inside the screen
                options={{ title: 'Mesaj' }} 
              />
              <Stack.Screen 
                name="ProfileModal" 
                component={ProfileModal} 
                options={{ title: 'Profilim', presentation: 'modal' }} 
              />
              <Stack.Screen 
                name="UserManagement" 
                component={UserManagementScreen} 
                options={{ title: 'Kullanıcı Yönetimi' }} 
              />
              <Stack.Screen 
                name="TicketCreate" 
                component={TicketCreateScreen} 
                options={{ title: 'Yeni Destek Talebi' }} 
              />
              <Stack.Screen 
                name="TicketDetail" 
                component={TicketDetailScreen} 
                options={{ title: 'Bilet Detayı' }} 
              />
              <Stack.Screen 
                name="TicketList" 
                component={TicketListScreen} 
                options={{ title: 'Destek Talepleri' }} 
              />
              <Stack.Screen 
                name="Notifications" 
                component={NotificationsScreen} 
                options={({ theme }) => ({ 
                  title: 'Bildirimler',
                  headerStyle: { backgroundColor: theme.card },
                  headerTintColor: theme.text,
                })} 
              />
              
              {/* Profil Görüntüleme */}
              <Stack.Screen 
                name="PublicProfile" 
                component={PublicProfileScreen} 
                options={({ theme }) => ({ 
                  headerStyle: { backgroundColor: theme.card },
                  headerTintColor: theme.text,
                })} 
              />
            </>
          ) : (
            <>
              {/* Kullanıcı Giriş Yapmamışsa Sadece Auth Ekranını Göster */}
              <Stack.Screen 
                name="UserAuth" 
                component={UserAuthScreen} 
                options={{ title: 'Giriş Yap / Kayıt Ol', headerShown: false }} 
              />
              <Stack.Screen 
                name="AdminLogin" 
                component={AdminLoginScreen} 
                options={{ title: 'Yönetici Girişi', presentation: 'modal' }} 
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [user, setUser] = useState(null);
  const [bannedStatus, setBannedStatus] = useState(null);

  useEffect(() => {
    let unsubscribeUserDoc = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (currentUser) {
        // Listen to the user's document for ban status
        unsubscribeUserDoc = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
          console.log(`[BAN TRACE] onSnapshot fired for UID: ${currentUser.uid}`);
          // Prevent leaked listener from hot-reloads applying another user's state
          if (auth.currentUser?.uid !== docSnap.id) {
            console.log(`[BAN TRACE] UID mismatch! Expected ${auth.currentUser?.uid}, got ${docSnap.id}`);
            return; 
          }

          if (docSnap.exists()) {
            const data = docSnap.data();
            console.log(`[BAN TRACE] Data found for ${docSnap.id}: role=${data.role}, isBanned=${data.isBanned}`);
            
            // YÖNETİCİ KORUMASI: Eğer db'de rolü 'admin' ise, asla ban ekranına düşme.
            if (data.role === 'admin') {
              setBannedStatus(null);
              setIsInitializing(false);
              return;
            }

            let isBannedCurrently = false;
            let banReason = '';

            if (data.isBanned) {
              isBannedCurrently = true;
              banReason = data.banReason 
                ? `Sebep: ${data.banReason}` 
                : 'Hesabınız kurallara uymadığınız için kalıcı olarak kapatılmıştır.';
            } else if (data.bannedUntil) {
              const now = new Date();
              const bannedTo = data.bannedUntil.toDate ? data.bannedUntil.toDate() : new Date(data.bannedUntil);
              if (bannedTo > now) {
                isBannedCurrently = true;
                const formattedDate = bannedTo.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' });
                
                banReason = data.banReason 
                  ? `Hesabınız uzaklaştırılmıştır.\nSebep: ${data.banReason}\nBitiş: ${formattedDate}`
                  : `Hesabınız geçici olarak uzaklaştırılmıştır.\nBitiş: ${formattedDate}`;
              } else {
                // Ban expired
                isBannedCurrently = false;
              }
            }

            if (isBannedCurrently) {
              console.log(`[BAN TRACE] Banning active session for ${docSnap.id} with reason: ${banReason}`);
              setBannedStatus(banReason);
            } else {
              setBannedStatus(null);
            }
          } else {
            console.log(`[BAN TRACE] No user document found for ${docSnap.id}`);
          }
          setIsInitializing(false);
        }, (err) => {
          console.log(`[BAN TRACE] Snapshot error for ${currentUser.uid}:`, err);
          setIsInitializing(false); // Permission error shouldn't hang the app
        });
      } else {
        console.log(`[BAN TRACE] No currentUser detected.`);
        setBannedStatus(null);
        setIsInitializing(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
    };
  }, []);

  if (isInitializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (bannedStatus) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#000' }}>
        <Ionicons name="warning-outline" size={80} color="#FF3B30" style={{ marginBottom: 20 }} />
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#FF3B30', marginBottom: 10 }}>Erişim Engellendi</Text>
        <Text style={{ fontSize: 16, color: '#fff', textAlign: 'center', marginBottom: 30, lineHeight: 24 }}>
          {bannedStatus}
        </Text>
        <TouchableOpacity 
          style={{ backgroundColor: '#222', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#444' }}
          onPress={() => auth.signOut()}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Çıkış Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AppNavigation user={user} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
