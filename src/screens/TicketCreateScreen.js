import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { db, auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

const COOLDOWN_MINUTES = 15;

const TicketCreateScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    const checkTicketEligibility = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        // 1) Açık ticket var mı kontrol et
        const openQ = query(
          collection(db, 'tickets'),
          where('creatorId', '==', user.uid),
          where('status', '==', 'open')
        );
        const openSnap = await getDocs(openQ);
        if (!openSnap.empty) {
          setBlocked(true);
          setBlockReason('Zaten açık bir destek biletiniz bulunmaktadır. Lütfen mevcut biletinizin kapatılmasını bekleyin.');
          setChecking(false);
          return;
        }

        // 2) Son kapatılan ticket'in zamanını kontrol et
        const closedQ = query(
          collection(db, 'tickets'),
          where('creatorId', '==', user.uid),
          where('status', '==', 'closed'),
          orderBy('lastUpdated', 'desc'),
          limit(5)
        );
        const closedSnap = await getDocs(closedQ);
        if (!closedSnap.empty) {
          // Find the most recent close time among the latest updated tickets
          let mostRecentCloseDate = null;
          
          closedSnap.forEach(docSnap => {
            const data = docSnap.data();
            const closeDate = data.closedAt?.toDate ? data.closedAt.toDate() 
                            : (data.lastUpdated?.toDate ? data.lastUpdated.toDate() : null);
                            
            if (closeDate) {
              if (!mostRecentCloseDate || closeDate > mostRecentCloseDate) {
                mostRecentCloseDate = closeDate;
              }
            }
          });

          if (mostRecentCloseDate) {
            const now = new Date();
            const diffMs = now - mostRecentCloseDate;
            const diffMin = diffMs / (1000 * 60);
            if (diffMin < COOLDOWN_MINUTES) {
              const remainingSec = Math.ceil((COOLDOWN_MINUTES * 60) - (diffMs / 1000));
              setCooldownRemaining(remainingSec);
              setBlocked(true);
              setBlockReason(`Son biletiniz kapatıldıktan sonra ${COOLDOWN_MINUTES} dakika beklemeniz gerekmektedir.`);
              setChecking(false);
              return;
            }
          }
        }

        setBlocked(false);
      } catch (e) {
        console.log('Ticket eligibility check error:', e);
      }
      setChecking(false);
    };
    checkTicketEligibility();
  }, []);

  // Cooldown sayacı
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setBlocked(false);
          setBlockReason('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      setImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleSubmit = async () => {
    if (blocked) {
      Alert.alert('Uyarı', blockReason);
      return;
    }

    if (!title.trim() || !description.trim()) {
      Alert.alert('Hata', 'Lütfen başlık ve açıklama giriniz.');
      return;
    }

    setLoading(true);
    try {
      const user = auth.currentUser;
      const ticketRef = await addDoc(collection(db, 'tickets'), {
        creatorId: user.uid,
        creatorName: user.displayName || user.email.split('@')[0],
        title: title.trim(),
        description: description.trim(),
        imageUrl: image,
        status: 'open',
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        lastMessage: description.trim(),
        unreadBy: 'admin',
        unreadCount: 1,
      });

      await addDoc(collection(db, 'tickets', ticketRef.id, 'messages'), {
        text: description.trim(),
        senderId: user.uid,
        senderName: user.displayName || user.email.split('@')[0],
        imageUrl: image,
        createdAt: serverTimestamp(),
      });

      Alert.alert('Başarılı', 'Biletiniz oluşturuldu. En kısa sürede yanıt verilecektir.', [
        { text: 'Tamam', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      console.error('Error creating ticket:', error);
      Alert.alert('Hata', 'Bilet oluşturulamadı.');
    }
    setLoading(false);
  };
  const formatCooldown = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (checking) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (blocked) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: 30 }]}>
        <Ionicons name="time-outline" size={64} color={theme.primary} style={{ marginBottom: 20 }} />
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 }}>
          Yeni Bilet Açılamıyor
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 20 }}>
          {blockReason}
        </Text>
        {cooldownRemaining > 0 && (
          <View style={{ backgroundColor: theme.card, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, marginBottom: 20 }}>
            <Text style={{ color: theme.primary, fontSize: 28, fontWeight: 'bold', textAlign: 'center' }}>
              {formatCooldown(cooldownRemaining)}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
              kalan süre
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={{ backgroundColor: theme.primary, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 10 }}
          onPress={() => navigation.goBack()}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background }]}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.text }]}>
          <Text style={[styles.label, { color: theme.text }]}>Konu Başlığı</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            placeholder="Kısaca problem nedir?"
            placeholderTextColor={theme.textSecondary}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={[styles.label, { color: theme.text, marginTop: 15 }]}>Açıklama</Text>
          <TextInput
            style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
            placeholder="Probleminizi detaylandırın..."
            placeholderTextColor={theme.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Text style={[styles.label, { color: theme.text, marginTop: 15 }]}>Görsel (Opsiyonel)</Text>
          <TouchableOpacity 
            style={[styles.imagePicker, { borderColor: theme.border, backgroundColor: theme.background }]} 
            onPress={pickImage}
          >
            {image ? (
              <Image source={{ uri: image }} style={styles.previewImage} />
            ) : (
              <View style={styles.placeholder}>
                <Ionicons name="camera-outline" size={40} color={theme.textSecondary} />
                <Text style={{ color: theme.textSecondary, marginTop: 8 }}>Görsel Ekle</Text>
              </View>
            )}
          </TouchableOpacity>
          {image && (
            <TouchableOpacity onPress={() => setImage(null)} style={styles.removeImage}>
              <Text style={{ color: '#FF3B30', fontWeight: 'bold' }}>Görseli Kaldır</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            style={[styles.submitButton, { backgroundColor: theme.primary }, loading && { opacity: 0.7 }]} 
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Bileti Gönder</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color={theme.textSecondary} />
          <Text style={[styles.infoText, { color: theme.textSecondary }]}>
            Yöneticilerimiz biletinizi inceleyip buradan sizinle iletişime geçecektir. Lütfen sabırlı olun.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  card: {
    padding: 20,
    borderRadius: 15,
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  imagePicker: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    alignItems: 'center',
  },
  removeImage: {
    marginTop: 8,
    alignItems: 'center',
  },
  submitButton: {
    marginTop: 25,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 10,
  },
  infoText: {
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
});

export default TicketCreateScreen;
