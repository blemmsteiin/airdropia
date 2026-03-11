import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, TextInput, Modal } from 'react-native';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

const UserManagementScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Ban Modal States
  const [banModalVisible, setBanModalVisible] = useState(false);
  const [selectedUserForBan, setSelectedUserForBan] = useState(null);
  const [banDurationValue, setBanDurationValue] = useState(null);
  const [banReasonText, setBanReasonText] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersList = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }));
      setUsers(usersList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredUsers = users.filter(u => {
    const name = (u.username || u.email || '').toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  const handleBanUser = (user, duration) => {
    setSelectedUserForBan(user);
    setBanDurationValue(duration);
    setBanReasonText(''); // reset reason
    setBanModalVisible(true);
  };

  const handleConfirmBan = async () => {
    if (!selectedUserForBan || !banDurationValue) return;
    
    let bannedUntil = null;
    let label = '';
    
    if (banDurationValue === 7) {
      bannedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      label = '7 gün';
    } else if (banDurationValue === 30) {
      bannedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      label = '30 gün';
    } else if (banDurationValue === 'permanent') {
      label = 'Kalıcı';
    }

    try {
      const updateData = banDurationValue === 'permanent'
        ? { isBanned: true, bannedUntil: null, banReason: banReasonText.trim() || null }
        : { isBanned: false, bannedUntil: bannedUntil.toISOString(), banReason: banReasonText.trim() || null };
      
      await updateDoc(doc(db, 'users', selectedUserForBan.id), updateData);
      Alert.alert('Başarılı', `${selectedUserForBan.username || selectedUserForBan.email} ${label} banlandı.`);
    } catch (e) {
      Alert.alert('Hata', 'İşlem başarısız oldu.');
      console.log(e);
    } finally {
      setBanModalVisible(false);
      setSelectedUserForBan(null);
      setBanDurationValue(null);
      setBanReasonText('');
    }
  };

  const handleUnbanUser = (user) => {
    Alert.alert(
      'Banı Kaldır',
      `${user.username || user.email} kullanıcısının banını kaldırmak istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Banı Kaldır',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', user.id), { isBanned: false, bannedUntil: null });
              Alert.alert('Başarılı', `${user.username || user.email} banı kaldırıldı.`);
            } catch (e) {
              Alert.alert('Hata', 'İşlem başarısız oldu.');
              console.log(e);
            }
          }
        }
      ]
    );
  };

  const showActionMenu = (user) => {
    if (user.role === 'admin') {
      Alert.alert('Erişim Reddedildi', 'Diğer yöneticileri banlayamaz veya banını kaldıramazsınız.');
      return;
    }

    const isBanned = user.isBanned || (user.bannedUntil && new Date(user.bannedUntil) > new Date());
    
    const buttons = [
      { text: 'İptal', style: 'cancel' },
    ];

    if (isBanned) {
      buttons.push({ text: '✅ Banı Kaldır', onPress: () => handleUnbanUser(user) });
    } else {
      buttons.push({ text: '⏳ 7 Gün Banla', onPress: () => handleBanUser(user, 7), style: 'destructive' });
      buttons.push({ text: '⏳ 30 Gün Banla', onPress: () => handleBanUser(user, 30), style: 'destructive' });
      buttons.push({ text: '🚫 Kalıcı Banla', onPress: () => handleBanUser(user, 'permanent'), style: 'destructive' });
    }

    Alert.alert(
      user.username || user.email || 'Kullanıcı',
      isBanned ? '🔴 Bu kullanıcı şu anda banlı.' : '🟢 Bu kullanıcı aktif.',
      buttons
    );
  };

  const getUserStatus = (user) => {
    if (user.isBanned) return { text: 'Kalıcı Ban', color: '#FF3B30' };
    if (user.bannedUntil && new Date(user.bannedUntil) > new Date()) {
      const remaining = Math.ceil((new Date(user.bannedUntil) - new Date()) / (1000 * 60 * 60 * 24));
      return { text: `${remaining} gün ban`, color: '#FF9500' };
    }
    return { text: 'Aktif', color: '#34C759' };
  };

  const renderItem = ({ item }) => {
    const status = getUserStatus(item);
    return (
      <TouchableOpacity 
        style={[styles.userCard, { backgroundColor: theme.card }]} 
        onPress={() => showActionMenu(item)}
      >
        <View style={styles.userInfo}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.avatar} />
          ) : (
            <Ionicons name="person-circle-outline" size={44} color={theme.textSecondary} />
          )}
          <View style={[styles.userText, { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }]}>
            <Text style={[styles.username, { color: theme.text }]}>
              {item.username || 'Anonim'}
            </Text>
            {item.role === 'admin' && (
              <Ionicons name="checkmark-circle" size={16} color="#1DA1F2" style={{ marginLeft: 4 }} />
            )}
            {item.banReason && (item.isBanned || item.bannedUntil) && (
              <Text style={{ width: '100%', fontSize: 12, color: theme.textSecondary, marginTop: 4 }} numberOfLines={2}>
                Sebep: {item.banReason}
              </Text>
            )}
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: status.color + '22' }]}>
          <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.searchContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Ionicons name="search" size={20} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Kullanıcı ara..."
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      
      <Text style={[styles.totalText, { color: theme.textSecondary }]}>
        Toplam {filteredUsers.length} kullanıcı
      </Text>

      <FlatList
        data={filteredUsers}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="people-outline" size={60} color={theme.textSecondary} />
            <Text style={{ color: theme.textSecondary, marginTop: 12, fontSize: 16 }}>
              Kullanıcı bulunamadı
            </Text>
          </View>
        }
      />

      {/* Ban Reason Modal */}
      <Modal
        visible={banModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setBanModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {selectedUserForBan?.username || selectedUserForBan?.email} kullanıcısını Banla
            </Text>
            
            <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
              Süre: {banDurationValue === 7 ? '7 Gün' : banDurationValue === 30 ? '30 Gün' : 'Kalıcı'}
            </Text>

            <TextInput
              style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              placeholder="Ban sebebi yazın (İsteğe bağlı)..."
              placeholderTextColor={theme.textSecondary}
              value={banReasonText}
              onChangeText={setBanReasonText}
              multiline
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: theme.border }]} 
                onPress={() => setBanModalVisible(false)}
              >
                <Text style={{ color: theme.text, fontWeight: 'bold' }}>İptal</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, { backgroundColor: '#FF3B30' }]} 
                onPress={handleConfirmBan}
              >
                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Banla</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
  },
  totalText: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontSize: 13,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userText: {
    marginLeft: 12,
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
  },
  email: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
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
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
    fontSize: 15,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginLeft: 10,
  }
});

export default UserManagementScreen;
