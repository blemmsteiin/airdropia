import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import { doc, getDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

const PublicProfileScreen = ({ route, navigation }) => {
  const { theme } = useTheme();
  const { userId } = route.params;
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const currentUser = auth.currentUser;
  
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Ban Modal States
  const [banModalVisible, setBanModalVisible] = useState(false);
  const [banDurationValue, setBanDurationValue] = useState(null);
  const [banReasonText, setBanReasonText] = useState('');

  useEffect(() => {
    // Listen to the target user's profile data
    const unsubscribeProfileUser = onSnapshot(doc(db, 'users', userId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserData(data);
        navigation.setOptions({ title: data.username || 'Profil' });
      } else {
        navigation.setOptions({ title: 'Kullanıcı Bulunamadı' });
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching user profile:", error);
      setLoading(false);
    });

    // Listen to current user's block list and role
    let unsubscribeCurrentUser = () => {};
    if (currentUser) {
      unsubscribeCurrentUser = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setIsAdmin(data.role === 'admin');
          if (currentUser.uid !== userId && data.blockedUsers?.includes(userId)) {
            setIsBlocked(true);
          } else {
            setIsBlocked(false);
          }
        }
      });
    }

    return () => {
      unsubscribeProfileUser();
      unsubscribeCurrentUser();
    };
  }, [userId, navigation, currentUser]);

  const toggleBlock = async () => {
    if (!currentUser) return;
    
    // Yöneticileri engellemeyi engelle
    if (userData?.role === 'admin') {
      Alert.alert('Erişim Reddedildi', 'Yöneticileri engelleyemezsiniz.');
      return;
    }

    const userRef = doc(db, 'users', currentUser.uid);
    try {
      if (isBlocked) {
        await updateDoc(userRef, {
          blockedUsers: arrayRemove(userId)
        });
      } else {
        await updateDoc(userRef, {
          blockedUsers: arrayUnion(userId)
        });
      }
    } catch (e) {
      console.log('Error toggling block:', e);
      Alert.alert('Hata', 'İşlem başarısız oldu.');
    }
  };

  const showBanMenu = () => {
    if (userData?.role === 'admin') {
      Alert.alert('Erişim Reddedildi', 'Diğer yöneticileri banlayamaz veya banını kaldıramazsınız.');
      return;
    }

    const isUserBanned = userData?.isBanned || (userData?.bannedUntil && new Date(userData.bannedUntil) > new Date());
    
    const buttons = [
      { text: 'İptal', style: 'cancel' },
    ];

    if (isUserBanned) {
      buttons.push({ 
        text: '✅ Banı Kaldır', 
        onPress: async () => {
          try {
            await updateDoc(doc(db, 'users', userId), { isBanned: false, bannedUntil: null });
            Alert.alert('Başarılı', `${userData.username || 'Kullanıcı'} banı kaldırıldı.`);
          } catch (e) {
            Alert.alert('Hata', 'İşlem başarısız oldu.');
          }
        } 
      });
    } else {
      buttons.push({ text: '⏳ 7 Gün Banla', onPress: () => { setBanDurationValue(7); setBanReasonText(''); setBanModalVisible(true); }, style: 'destructive' });
      buttons.push({ text: '⏳ 30 Gün Banla', onPress: () => { setBanDurationValue(30); setBanReasonText(''); setBanModalVisible(true); }, style: 'destructive' });
      buttons.push({ text: '🚫 Kalıcı Banla', onPress: () => { setBanDurationValue('permanent'); setBanReasonText(''); setBanModalVisible(true); }, style: 'destructive' });
    }

    Alert.alert(
      userData?.username || 'Kullanıcı',
      isUserBanned ? '🔴 Bu kullanıcı şu anda banlı.' : '🟢 Bu kullanıcı aktif.',
      buttons
    );
  };

  const handleConfirmBan = async () => {
    if (!banDurationValue) return;
    
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
      
      await updateDoc(doc(db, 'users', userId), updateData);
      Alert.alert('Başarılı', `${userData.username || 'Kullanıcı'} ${label} banlandı.`);
    } catch (e) {
      Alert.alert('Hata', 'İşlem başarısız oldu.');
      console.log(e);
    } finally {
      setBanModalVisible(false);
      setBanDurationValue(null);
      setBanReasonText('');
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!userData) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Ionicons name="person-off-outline" size={64} color={theme.textSecondary} />
        <Text style={{ color: theme.textSecondary, marginTop: 16, fontSize: 16 }}>Kullanıcı bulunamadı.</Text>
      </View>
    );
  }

  const joinDate = userData.createdAt?.toDate 
    ? userData.createdAt.toDate().toLocaleDateString('tr-TR') 
    : 'Bilinmiyor';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.avatarContainer}>
          {userData.avatar ? (
             <Image source={{ uri: userData.avatar }} style={styles.avatar} />
          ) : (
             <Ionicons name="person-circle-outline" size={100} color={theme.textSecondary} />
          )}
        </View>
        
        <View style={styles.nameContainer}>
          <Text style={[styles.username, { color: theme.text }]}>
             {userData.username || 'İsimsiz Kullanıcı'}
          </Text>
          {userData.role === 'admin' && (
             <Ionicons name="checkmark-circle" size={24} color="#1DA1F2" style={{ marginLeft: 6 }} />
          )}
        </View>
        
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={20} color={theme.textSecondary} style={{ marginRight: 8 }} />
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            Üyelik Tarihi: {joinDate}
          </Text>
        </View>

        {(userData.isBanned || userData.bannedUntil) && (
          <View style={[styles.bannedBadge, { backgroundColor: 'rgba(255, 59, 48, 0.1)', flexDirection: 'column', alignItems: 'flex-start' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="warning-outline" size={16} color="#FF3B30" style={{ marginRight: 6 }} />
              <Text style={{ color: '#FF3B30', fontWeight: 'bold' }}>Uzaklaştırılmış Hesap</Text>
            </View>
            {userData.banReason && (
              <Text style={{ color: '#FF3B30', marginTop: 4, fontSize: 13, paddingLeft: 22 }}>
                Sebep: {userData.banReason}
              </Text>
            )}
          </View>
        )}

        {/* Message Button */}
        {currentUser && currentUser.uid !== userId && 
         !(userData?.role?.toLowerCase() === 'admin' && !isAdmin) && (
          <TouchableOpacity 
            style={[styles.blockButton, { borderColor: theme.primary, marginTop: 24 }]} 
            onPress={() => {
              navigation.navigate('ChatDetail', { 
                otherUser: { id: userId, uid: userId, ...userData } 
              });
            }}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={theme.primary} style={{ marginRight: 8 }} />
            <Text style={[styles.blockButtonText, { color: theme.primary }]}>
              Mesaj Gönder
            </Text>
          </TouchableOpacity>
        )}

        {/* Block Button */}
        {currentUser && currentUser.uid !== userId && userData.role !== 'admin' && (
          <TouchableOpacity 
            style={[styles.blockButton, { borderColor: isBlocked ? '#34C759' : '#FF3B30', marginTop: 12 }]} 
            onPress={toggleBlock}
          >
            <Ionicons name={isBlocked ? "checkmark-circle-outline" : "ban-outline"} size={20} color={isBlocked ? '#34C759' : '#FF3B30'} style={{ marginRight: 8 }} />
            <Text style={[styles.blockButtonText, { color: isBlocked ? '#34C759' : '#FF3B30' }]}>
              {isBlocked ? 'Engeli Kaldır' : 'Kullanıcıyı Engelle'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Admin Ban UI Button */}
        {isAdmin && currentUser.uid !== userId && userData.role !== 'admin' && (
          <TouchableOpacity 
            style={[styles.blockButton, { borderColor: '#8A2BE2', marginTop: 12 }]} 
            onPress={showBanMenu}
          >
            <Ionicons name="hammer-outline" size={20} color="#8A2BE2" style={{ marginRight: 8 }} />
            <Text style={[styles.blockButtonText, { color: '#8A2BE2' }]}>
              Yönetici Paneli (Ceza/Ban)
            </Text>
          </TouchableOpacity>
        )}
      </View>

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
              {userData?.username || 'Kullanıcı'} kullanıcısını Banla
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
  container: {
    flex: 1,
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 20,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 8,
    width: '100%',
    justifyContent: 'center',
  },
  infoText: {
    fontSize: 15,
  },
  bannedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  blockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    width: '100%',
    justifyContent: 'center',
  },
  blockButtonText: {
    fontSize: 15,
    fontWeight: '600',
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

export default PublicProfileScreen;
