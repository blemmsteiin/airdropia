import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Image, TextInput, Alert, Platform, Animated, ScrollView } from 'react-native';
import { collection, query, onSnapshot, orderBy, where, doc, updateDoc, deleteDoc, getDocs, arrayRemove } from 'firebase/firestore';
import { Swipeable } from 'react-native-gesture-handler';
import { db, auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ChatListScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const [users, setUsers] = useState([]);
  const [recentChats, setRecentChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [myTickets, setMyTickets] = useState([]);

  const currentUser = auth.currentUser;

  useEffect(() => {
    const checkAdmin = async () => {
      const adminCache = await AsyncStorage.getItem('isAdmin_cache');
      setIsAdmin(adminCache === 'true');
    };
    checkAdmin();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    // Fetch all users to display in the list
    const q1 = query(collection(db, 'users'), orderBy('createdAt', 'desc'));

    const unsubscribeUsers = onSnapshot(q1, (snapshot) => {
      const fetchedUsers = [];
      snapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.uid !== currentUser.uid) {
           fetchedUsers.push(userData);
        }
      });
      setUsers(fetchedUsers);
    });

    // Fetch recent chats
    const q2 = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid)
    );

    const unsubscribeChats = onSnapshot(q2, (snapshot) => {
      const fetchedChats = [];
      snapshot.forEach(doc => {
        fetchedChats.push({ roomId: doc.id, ...doc.data() });
      });

      // Avoid Firebase composite index error by sorting client-side
      fetchedChats.sort((a, b) => {
        const timeA = a.lastUpdated?.seconds || 0;
        const timeB = b.lastUpdated?.seconds || 0;
        return timeB - timeA;
      });

      setRecentChats(fetchedChats);
      setLoading(false);
    });

    // Cleanup: Unblock any admins that might have been accidentally blocked
    const cleanupAdmins = async () => {
      try {
        const adminQ = query(collection(db, 'users'), where('role', '==', 'admin'));
        const adminSnap = await getDocs(adminQ);
        const adminIds = adminSnap.docs.map(doc => doc.id);
        
        if (adminIds.length > 0) {
          const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', currentUser.uid)));
          if (!userSnap.empty) {
            const userData = userSnap.docs[0].data();
            const blockedUsers = userData.blockedUsers || [];
            const blockedAdmins = blockedUsers.filter(id => adminIds.includes(id));
            
            if (blockedAdmins.length > 0) {
              const userRef = doc(db, 'users', currentUser.uid);
              for (const adminId of blockedAdmins) {
                await updateDoc(userRef, {
                  blockedUsers: arrayRemove(adminId)
                });
              }
              console.log('Cleaned up blocked admins:', blockedAdmins);
            }
          }
        }
      } catch (e) {
        console.log('Error cleaning up admins:', e);
      }
    };
    cleanupAdmins();

    // Listen to tickets
    const qTickets = isAdmin 
      ? query(collection(db, 'tickets'), where('status', '==', 'open'))
      : query(collection(db, 'tickets'), where('creatorId', '==', currentUser.uid));

    const unsubscribeTickets = onSnapshot(qTickets, (snapshot) => {
      const fetched = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (isAdmin && data.deletedForAdmin) return;
        if (!isAdmin && data.deletedForUser) return;
        fetched.push({ id: doc.id, ...data });
      });
      // Firebase index hatasını önlemek için sıralamayı client tarafında (burada) yapıyoruz
      fetched.sort((a, b) => {
        const timeA = a.lastUpdated?.seconds || 0;
        const timeB = b.lastUpdated?.seconds || 0;
        return timeB - timeA; // En yeni en üstte
      });
      setMyTickets(fetched);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeChats();
      unsubscribeTickets();
    };
  }, [currentUser, isAdmin]);

  const handleStartChat = (selectedUser) => {
    navigation.navigate('ChatDetail', { 
      otherUser: selectedUser 
    });
  };

  const handleDeleteChat = (chatItem) => {
    const roomId = chatItem.roomId;
    if (!roomId) return;
    Alert.alert(
      'Sohbeti Sil',
      'Bu sohbeti ve tüm mesaj geçmişini silmek istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete all messages in the subcollection first
              const messagesRef = collection(db, 'chats', roomId, 'messages');
              const messagesSnap = await getDocs(messagesRef);
              const deletePromises = [];
              messagesSnap.forEach(msgDoc => {
                deletePromises.push(deleteDoc(doc(db, 'chats', roomId, 'messages', msgDoc.id)));
              });
              await Promise.all(deletePromises);
              // Then delete the chat document
              await deleteDoc(doc(db, 'chats', roomId));
            } catch (e) {
              console.log('Error deleting chat:', e);
              Alert.alert('Hata', 'Sohbet silinemedi.');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }) => {
    // Determine the display name (admin does NOT get special fallback anymore)
    const displayName = item.username || item.email?.split('@')[0];

    const renderRightActions = (progress, dragX) => {
      const scale = dragX.interpolate({
        inputRange: [-100, 0],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      });
      return (
        <TouchableOpacity
          style={styles.deleteSwipeButton}
          onPress={() => handleDeleteChat(item)}
        >
          <Animated.Text style={[styles.deleteSwipeText, { transform: [{ scale }] }]}>
            Sil
          </Animated.Text>
        </TouchableOpacity>
      );
    };

    const chatRow = (
      <TouchableOpacity 
        style={[styles.userItem, { backgroundColor: theme.card, borderBottomColor: theme.border }]} 
        onPress={() => handleStartChat(item)}
      >
        <TouchableOpacity 
          style={styles.avatar}
          onPress={(e) => { e.stopPropagation(); navigation.navigate('PublicProfile', { userId: item.uid || item.id }); }}
        >
          {item.avatar ? (
             <Image source={{ uri: item.avatar }} style={styles.profileImage} />
          ) : (
             <Ionicons name="person-circle-outline" size={40} color={theme.textSecondary} />
          )}
        </TouchableOpacity>
        <View style={styles.userInfo}>
           <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.userName, { color: theme.text }]}>
                {displayName}
              </Text>
              {item.role === 'admin' && (
                <Ionicons name="checkmark-circle" size={16} color="#1DA1F2" style={{ marginLeft: 4, marginBottom: 4 }} />
              )}
            </View>
           <Text 
              style={[styles.userStatus, { color: item.hasUnread ? '#fff' : theme.textSecondary, fontWeight: item.hasUnread ? 'bold' : 'normal' }]}
              numberOfLines={1}
            >
              {item.isRecent ? (item.lastMessage || 'Sohbet başlatıldı') : (item.role === 'admin' ? 'Teknik Destek' : 'Üye')}
            </Text>
        </View>
        <View style={{ alignItems: 'flex-end', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
           <View style={{ alignItems: 'flex-end' }}>
             {(item.isBanned || item.bannedUntil) && (
               <Text style={{ color: '#FF3B30', fontSize: 10, fontWeight: 'bold', marginBottom: 4 }}>BANLI</Text>
             )}
             {item.hasUnread && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{item.unreadCount || 1}</Text>
                </View>
              )}
             <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
           </View>
           {item.isRecent && Platform.OS !== 'ios' && (
             <TouchableOpacity onPress={() => handleDeleteChat(item)} style={{ padding: 4 }}>
               <Ionicons name="ellipsis-vertical" size={18} color={theme.textSecondary} />
             </TouchableOpacity>
           )}
        </View>
      </TouchableOpacity>
    );

    // iOS: wrap in Swipeable for swipe-to-delete
    if (item.isRecent && Platform.OS === 'ios') {
      return (
        <Swipeable renderRightActions={renderRightActions}>
          {chatRow}
        </Swipeable>
      );
    }

    return chatRow;
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  // Compute display name for search (admin does NOT get special fallback anymore)
  const getDisplayName = (u) => u.username || u.email?.split('@')[0];

  let displayData = [];
  const searchStr = searchQuery.trim().toLowerCase();

  if (searchStr.length > 0) {
    if (searchStr.length >= 3) {
      displayData = users.filter(u => {
        if (u.role === 'admin') return false;
        const dName = getDisplayName(u)?.toLowerCase() || '';
        return dName.includes(searchStr);
      });
    } else {
      // search is 1 or 2 chars, show nothing until 3 chars
      displayData = [];
    }
  } else {
    // Show recent chats when search is empty
    displayData = recentChats.map(chat => {
      const otherUid = chat.participants?.find(p => p !== currentUser.uid);
      const otherUserObj = users.find(u => u.uid === otherUid);
      if (!otherUserObj) return null;

      return {
        ...otherUserObj,
        lastMessage: chat.lastMessageMap && chat.lastMessageMap[currentUser.uid] !== undefined ? chat.lastMessageMap[currentUser.uid] : chat.lastMessage,
        hasUnread: chat.unreadBy === currentUser.uid,
        unreadCount: chat.unreadCount || 1,
        roomId: chat.roomId,
        isRecent: true
      };
    }).filter(item => item !== null);
  }

  const renderTicketSection = () => (
    <View style={[styles.ticketSection, { borderBottomColor: theme.border }]}>
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="help-buoy-outline" size={22} color={theme.primary} />
          <Text style={[styles.sectionTitleText, { color: theme.text }]}> Destek & Ticket</Text>
        </View>
        <TouchableOpacity 
          onPress={() => isAdmin ? navigation.navigate('TicketList') : navigation.navigate('TicketCreate')}
        >
          <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 13 }}>
            {isAdmin ? 'Tümüne Bak' : '+ Yeni Oluştur'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        {myTickets.length === 0 ? (
          <View style={[styles.emptyTicketCard, { borderColor: theme.border }]}>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Aktif talebiniz yok.</Text>
          </View>
        ) : (
          myTickets.map(ticket => (
            <TouchableOpacity 
              key={ticket.id} 
              style={[styles.ticketCard, { backgroundColor: theme.card, shadowColor: theme.text }]}
              onPress={() => navigation.navigate('TicketDetail', { ticketId: ticket.id, ticketTitle: ticket.title })}
            >
              <View style={styles.ticketCardHeader}>
                <View style={[styles.miniStatus, { backgroundColor: ticket.status === 'open' ? '#34C759' : '#666' }]} />
                {((isAdmin && ticket.unreadBy === 'admin') || (!isAdmin && ticket.unreadBy === currentUser.uid)) && (
                   <View style={styles.ticketBadge} />
                )}
              </View>
              <Text style={[styles.ticketCardTitle, { color: theme.text }]} numberOfLines={1}>{ticket.title}</Text>
              <Text style={[styles.ticketCardSub, { color: theme.textSecondary }]} numberOfLines={1}>
                {isAdmin ? ticket.creatorName : ticket.lastMessage}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {searchStr.length === 0 && renderTicketSection()}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {searchStr.length > 0 ? 'Arama Sonuçları' : 'Son Mesajlaşmalar'}
        </Text>
      </View>
      
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={theme.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
          placeholder="Kullanıcı adı ile ara..."
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={displayData}
        keyExtractor={item => item.uid}
        renderItem={renderItem}
        contentContainerStyle={{ paddingVertical: 8 }}
        ListEmptyComponent={
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
               {searchStr.length > 0 && searchStr.length < 3 
                 ? "Arama yapmak için lütfen en az 3 harf girin." 
                 : searchStr.length >= 3 
                   ? "Kullanıcı bulunamadı."
                   : "Henüz bir mesajlaşmanız bulunmuyor. Yukarıdan arama yaparak ilk sohbetinizi başlatın!"}
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  avatar: {
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userStatus: {
    fontSize: 13,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd'
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: {
    position: 'absolute',
    left: 28,
    zIndex: 1,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 20,
    paddingLeft: 40,
    paddingRight: 16,
    fontSize: 15,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF3B30',
    marginBottom: 4,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButton: {
    backgroundColor: '#007AFF', // default
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 10,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteSwipeButton: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  deleteSwipeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  ticketSection: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitleText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  ticketCard: {
    width: 140,
    padding: 12,
    borderRadius: 12,
    marginRight: 10,
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  emptyTicketCard: {
    width: 140,
    height: 60,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ticketCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  miniStatus: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ticketBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
  },
  ticketCardTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  ticketCardSub: {
    fontSize: 11,
  },
});

export default ChatListScreen;
