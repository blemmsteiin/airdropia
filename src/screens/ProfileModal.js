import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, ScrollView, TextInput } from 'react-native';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { signOut, deleteUser, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ProfileModal = ({ navigation }) => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarBase64, setAvatarBase64] = useState(null);
  const [username, setUsername] = useState('');
  const [originalUsername, setOriginalUsername] = useState('');
  const [usernameChanged, setUsernameChanged] = useState(false);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [role, setRole] = useState('');

  const currentUser = auth.currentUser;

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    if (!currentUser) return;
    try {
      // Users koleksiyonunda döküman yoksa getirme hatası verebilir, garantiye alalım
      const userRef = doc(db, 'users', currentUser.uid);
      const docSnap = await getDoc(userRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.avatar) setAvatarBase64(data.avatar);
        if (data.username) {
          setUsername(data.username);
          setOriginalUsername(data.username);
        }
        if (data.role) setRole(data.role);
        if (data.usernameChanged) setUsernameChanged(true);
      } else {
        // İlk defa geliyorsa isim olarak email alınabilir
        setUsername(currentUser.displayName || currentUser.email.split('@')[0]);
      }
    } catch (error) {
      console.log('Error fetching profile:', error);
    }
    setLoading(false);
  };

  const pickImage = async () => {
    // Fotoğraf galerisi erişim izni
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert("İzin Gerekli", "Galeriye erişim izni vermeniz gerekiyor.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, // Kullanıcı resmi kırpabilsin
      aspect: [1, 1], // Kare (Avatar için)
      quality: 0.3, // Base64 boyutunu düşük tutmak için kaliteyi düşürüyoruz
      base64: true, // ÖNEMLİ: firebase storage olmadığı için doğrudan string lazım
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const base64String = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setAvatarBase64(base64String);
    }
  };

  const handleSave = async () => {
    if (!currentUser) return;
    setSaving(true);
    
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      
      const usernameActuallyChanged = username.trim() !== originalUsername.trim() && username.trim().length > 0;
      
      if (usernameActuallyChanged && username.trim().length < 3) {
        Alert.alert('Hata', 'Kullanıcı adı en az 3 karakter olmalıdır.');
        setSaving(false);
        return;
      }

      const updateData = {
        avatar: avatarBase64 || null,
        username: username.trim() || currentUser.displayName || currentUser.email.split('@')[0],
        updatedAt: new Date()
      };

      // Eğer kullanıcı adı değişmişse ve daha önce değiştirmemişse flag'i set et
      if (usernameActuallyChanged && !usernameChanged && role !== 'admin') {
        updateData.usernameChanged = true;
        setUsernameChanged(true);
        setOriginalUsername(username.trim());
      }

      await setDoc(userRef, updateData, { merge: true });

      setIsEditingUsername(false);
      Alert.alert('Başarılı', 'Profiliniz güncellendi!');
      navigation.goBack();
      
    } catch (error) {
      console.log('Error saving profile:', error);
      Alert.alert('Hata', 'Profil kaydedilirken bir sorun oluştu.');
    }
    setSaving(false);
  };

  const handleLogout = async () => {
    Alert.alert(
      'Çıkış Yap',
      'Hesabınızdan çıkış yapmak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: async () => {
            try {
              if (role === 'admin') {
                await AsyncStorage.removeItem('isAdmin_cache');
              }
              await signOut(auth);
              navigation.goBack(); // Close modal, App.js will handle redirect
            } catch (error) {
              console.log('Logout error:', error);
              Alert.alert('Hata', 'Çıkış yapılamadı.');
            }
          }
        }
      ]
    );
  };

  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    
    Alert.alert(
      'HESABI SİL',
      'Hesabınızı silmek istediğinize emin misiniz? Bu işlem geri alınamaz ve tüm verileriniz kalıcı olarak silinir. Ayrıca bu e-posta adresiyle bir daha hesap açamazsınız.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Hesabımı Sil',
          style: 'destructive',
          onPress: async () => {
            promptPasswordForDeletion();
          }
        }
      ]
    );
  };

  const promptPasswordForDeletion = () => {
    Alert.prompt(
      "Şifre Onayı",
      "Hesabınızı silmek için güvenliğiniz gereği şifrenizi girmeniz gerekmektedir.",
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Onayla ve Sil",
          style: "destructive",
          onPress: async (password) => {
            if (!password) {
              Alert.alert('Hata', 'Şifre girmeden hesap silemezsiniz.');
              return;
            }
            performDeletion(password);
          }
        }
      ],
      "secure-text"
    );
  };

  const performDeletion = async (password) => {
    setLoading(true);
    try {
      const email = currentUser.email;
      
      // 1. Re-authenticate
      const credential = EmailAuthProvider.credential(email, password);
      await reauthenticateWithCredential(currentUser, credential);

      // 2. Kara Listeye Ekle ( deleted_emails koleksiyonu )
      await setDoc(doc(db, 'deleted_emails', email.toLowerCase()), {
        deletedAt: new Date(),
        uid: currentUser.uid
      });

      // 3. Kullanıcı Verilerini Sil
      await deleteDoc(doc(db, 'users', currentUser.uid));
      
      // 4. Auth Kullanıcısını Sil
      await deleteUser(currentUser);

      Alert.alert('Hesap Silindi', 'Hesabınız başarıyla silindi. Güle güle!');
      navigation.goBack();
    } catch (error) {
      console.log('Account deletion error:', error);
      if (error.code === 'auth/wrong-password') {
        Alert.alert('Hata', 'Girdiğiniz şifre hatalı.');
      } else {
        Alert.alert('Hata', 'Hesap silinirken bir sorun oluştu.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}>
      
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.title, { color: theme.text }]}>Profil Resmi</Text>
        
        <View style={styles.avatarContainer}>
          {avatarBase64 ? (
            <Image 
              source={{ uri: avatarBase64 }} 
              style={[styles.avatar, { borderColor: theme.border }]} 
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: theme.border }]}>
              <Text style={{ color: theme.textSecondary, fontSize: 40 }}>👤</Text>
            </View>
          )}
          
          <TouchableOpacity style={[styles.changeAvatarBtn, { backgroundColor: theme.primary }]} onPress={pickImage}>
            <Text style={styles.changeAvatarText}>Görsel Seç</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, { color: theme.textSecondary }]}>E-posta</Text>
        <Text style={[styles.infoText, { color: theme.text }]}>{currentUser?.email}</Text>

        <Text style={[styles.label, { color: theme.textSecondary, marginTop: 15 }]}>Kullanıcı Adı</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {isEditingUsername ? (
            <TextInput
              style={[styles.infoText, { color: theme.text, flex: 1, borderBottomWidth: 1, borderBottomColor: theme.primary, paddingBottom: 4 }]}
              value={username}
              onChangeText={setUsername}
              placeholder="Yeni kullanıcı adı"
              placeholderTextColor={theme.textSecondary}
              autoFocus
              maxLength={20}
            />
          ) : (
            <Text style={[styles.infoText, { color: theme.text, flex: 1 }]}>{username}</Text>
          )}
          {role !== 'admin' && !usernameChanged && !isEditingUsername && (
            <TouchableOpacity onPress={() => setIsEditingUsername(true)} style={{ padding: 6 }}>
              <Text style={{ color: theme.primary, fontSize: 13, fontWeight: 'bold' }}>✏️ Değiştir</Text>
            </TouchableOpacity>
          )}
          {isEditingUsername && (
            <TouchableOpacity onPress={() => { setUsername(originalUsername); setIsEditingUsername(false); }} style={{ padding: 6 }}>
              <Text style={{ color: '#FF3B30', fontSize: 13, fontWeight: 'bold' }}>İptal</Text>
            </TouchableOpacity>
          )}
        </View>
        {role !== 'admin' && !usernameChanged && (
          <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>⚠️ Kullanıcı adınızı yalnızca 1 kez değiştirebilirsiniz.</Text>
        )}

        <TouchableOpacity 
          style={[styles.saveButton, { backgroundColor: theme.primary }]} 
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Profili Kaydet</Text>}
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.logoutButton, { borderColor: '#FF3B30' }]} 
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Çıkış Yap</Text>
        </TouchableOpacity>

        {role !== 'admin' && (
          <TouchableOpacity 
            style={{ marginTop: 40, alignItems: 'center' }} 
            onPress={handleDeleteAccount}
          >
            <Text style={{ color: '#FF3B30', fontSize: 13, textDecorationLine: 'underline' }}>Hesabımı Kalıcı Olarak Sil</Text>
          </TouchableOpacity>
        )}
      </View>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    borderRadius: 12,
    padding: 24,
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  changeAvatarBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  changeAvatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  label: {
    fontSize: 14,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  saveButton: {
    marginTop: 30,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  logoutButton: {
    marginTop: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  logoutButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: 'bold',
  }
});

export default ProfileModal;
