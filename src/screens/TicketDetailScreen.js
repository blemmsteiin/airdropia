import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Image, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Modal, Dimensions, TouchableWithoutFeedback } from 'react-native';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, setDoc, deleteDoc, increment } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { db, auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TicketDetailScreen = ({ route, navigation }) => {
  const { theme } = useTheme();
  const { ticketId, ticketTitle } = route.params;
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [ticketData, setTicketData] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [downloading, setDownloading] = useState(false);
  
  const currentUser = auth.currentUser;
  const flatListRef = useRef();

  useEffect(() => {
    navigation.setOptions({ title: ticketTitle || 'Bilet Detayı' });

    // Listen to ticket metadata
    const unsubTicket = onSnapshot(doc(db, 'tickets', ticketId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTicketData(data);
        
        // Mark as read if I'm the one who needs to read it
        if (data.unreadBy === currentUser.uid || (data.unreadBy === 'admin' && isAdmin)) {
          updateDoc(doc(db, 'tickets', ticketId), { 
            unreadBy: null,
            unreadCount: 0 
          });
        }
      }
    });

    // Listen to messages
    const q = query(collection(db, 'tickets', ticketId, 'messages'), orderBy('createdAt', 'desc'));
    const unsubMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      setLoading(false);
    });

    // Check if current user is admin
    const checkAdmin = async () => {
      const adminCache = await AsyncStorage.getItem('isAdmin_cache');
      setIsAdmin(adminCache === 'true');
    };
    checkAdmin();

    return () => {
      unsubTicket();
      unsubMessages();
    };
  }, [ticketId, isAdmin]);

  const handleSend = async (imageUri = null) => {
    if (!newMessage.trim() && !imageUri) return;
    if (ticketData?.status === 'closed') {
      Alert.alert('Hata', 'Bu bilet kapalı olduğu için mesaj gönderilemez.');
      return;
    }

    setSending(true);
    try {
      const payload = {
        text: newMessage.trim(),
        senderId: currentUser.uid,
        senderName: currentUser.displayName || currentUser.email.split('@')[0],
        createdAt: serverTimestamp(),
      };
      if (imageUri) payload.imageUrl = imageUri;

      await addDoc(collection(db, 'tickets', ticketId, 'messages'), payload);

      // Update ticket metadata
      await updateDoc(doc(db, 'tickets', ticketId), {
        lastMessage: imageUri ? '📷 Görsel' : newMessage.trim(),
        lastUpdated: serverTimestamp(),
        unreadBy: currentUser.uid === ticketData.creatorId ? 'admin' : ticketData.creatorId,
        unreadCount: increment(1)
      });

      setNewMessage('');
    } catch (error) {
      console.error('Send error:', error);
    }
    setSending(false);
  };

  const pickImage = async () => {
    if (ticketData?.status === 'closed') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled) {
      handleSend(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleCloseTicket = () => {
    Alert.alert(
      'Bileti Kapat',
      'Bu yardım talebi çözüldü mü? Kapatıldıktan sonra yeni mesaj gönderilemez.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { 
          text: 'Kapat', 
          style: 'destructive', 
          onPress: async () => {
            await updateDoc(doc(db, 'tickets', ticketId), { 
              status: 'closed',
              closedAt: serverTimestamp()
            });
          }
        }
      ]
    );
  };

  const handleDeleteTicket = () => {
    Alert.alert(
      'Bileti Sil',
      'Bu bileti kalıcı olarak silmek istediğinize emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { 
          text: 'Sil', 
          style: 'destructive', 
          onPress: async () => {
            try {
              if (isAdmin) {
                await updateDoc(doc(db, 'tickets', ticketId), {
                  deletedForAdmin: true
                });
              } else {
                await updateDoc(doc(db, 'tickets', ticketId), {
                  deletedForUser: true
                });
              }
              navigation.goBack();
            } catch (error) {
              Alert.alert('Hata', 'Bilet silinemedi.');
            }
          }
        }
      ]
    );
  };

  const handleDownloadImage = async (uri) => {
    try {
      setDownloading(true);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Hata', 'Görseli kaydetmek için galeri erişim izni gerekiyor.');
        setDownloading(false);
        return;
      }

      let fileUri = uri;
      
      // Eğer base64 formatındaysa, geçici dosyaya yazıp oradan kaydetmemiz gerekir
      if (uri.startsWith('data:image')) {
        const base64Code = uri.split(',')[1];
        const tempUri = FileSystem.cacheDirectory + `ticket_image_${Date.now()}.jpg`;
        await FileSystem.writeAsStringAsync(tempUri, base64Code, {
          encoding: FileSystem.EncodingType.Base64,
        });
        fileUri = tempUri;
      } else if (uri.startsWith('http')) {
        // Eğer link URL ise önce indir
        const tempUri = FileSystem.cacheDirectory + `ticket_image_${Date.now()}.jpg`;
        const { uri: downloadedUri } = await FileSystem.downloadAsync(uri, tempUri);
        fileUri = downloadedUri;
      }

      await MediaLibrary.createAssetAsync(fileUri);
      Alert.alert('Başarılı', 'Görsel başarıyla cihazınıza kaydedildi.');
    } catch (error) {
      console.log('Download error:', error);
      Alert.alert('Hata', 'Görsel kaydedilirken bir sorun oluştu.');
    } finally {
      setDownloading(false);
    }
  };

  const renderItem = ({ item }) => {
    const isMe = item.senderId === currentUser.uid;
    return (
      <View style={[styles.messageRow, isMe ? styles.myRow : styles.otherRow]}>
        <View style={[styles.bubble, isMe ? { backgroundColor: theme.primary } : { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 }]}>
          <Text style={[styles.senderName, { color: isMe ? '#eee' : theme.textSecondary }]}>{item.senderName}</Text>
          {item.imageUrl && (
            <TouchableOpacity onPress={() => setSelectedImage(item.imageUrl)}>
              <Image source={{ uri: item.imageUrl }} style={styles.messageImage} />
            </TouchableOpacity>
          )}
          {item.text ? <Text style={[styles.messageText, { color: isMe ? '#fff' : theme.text }]}>{item.text}</Text> : null}
        </View>
      </View>
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
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: theme.background }]} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={[styles.statusHeader, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={[styles.statusBadge, { backgroundColor: ticketData?.status === 'open' ? '#34C759' : '#666' }]}>
          <Text style={styles.statusText}>{ticketData?.status === 'open' ? 'Açık' : 'Kapalı'}</Text>
        </View>
        <Text style={[styles.ticketTitle, { color: theme.text }]} numberOfLines={1}>{ticketTitle}</Text>
        {(ticketData?.status === 'open' && isAdmin) && (
           <TouchableOpacity onPress={handleCloseTicket} style={styles.closeBtn}>
             <Ionicons name="checkmark-done-circle-outline" size={24} color="#FF3B30" />
           </TouchableOpacity>
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        inverted
        contentContainerStyle={styles.listContainer}
      />

      {ticketData?.status === 'open' ? (
        <View style={[styles.inputContainer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <TouchableOpacity style={styles.attachButton} onPress={pickImage}>
            <Ionicons name="image-outline" size={28} color={theme.textSecondary} />
          </TouchableOpacity>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
            placeholder="Mesaj yazın..."
            placeholderTextColor={theme.textSecondary}
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
          />
          <TouchableOpacity 
            style={[styles.sendButton, { backgroundColor: newMessage.trim() ? theme.primary : theme.border }]} 
            onPress={() => handleSend()}
            disabled={!newMessage.trim() || sending}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.closedBanner, { backgroundColor: theme.card, alignItems: 'center', padding: 20 }]}>
          <Text style={{ color: theme.textSecondary, fontWeight: 'bold', fontSize: 16 }}>Bu bilet kapatılmıştır.</Text>
          <TouchableOpacity 
            style={{ marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#FF3B30', borderRadius: 8 }}
            onPress={handleDeleteTicket}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>🗑️ Bileti Sil</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Full Screen Image Modal */}
      <Modal visible={!!selectedImage} transparent={true} animationType="fade">
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.modalCloseButton} onPress={() => setSelectedImage(null)}>
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.downloadButton} onPress={() => handleDownloadImage(selectedImage)} disabled={downloading}>
            {downloading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="download-outline" size={30} color="#fff" />
            )}
          </TouchableOpacity>
          <TouchableWithoutFeedback onPress={() => setSelectedImage(null)}>
            <Image
              source={{ uri: selectedImage }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          </TouchableWithoutFeedback>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 10,
  },
  statusText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  ticketTitle: { flex: 1, fontSize: 16, fontWeight: 'bold' },
  closeBtn: { padding: 4 },
  listContainer: { padding: 16 },
  messageRow: { marginBottom: 12, flexDirection: 'row' },
  myRow: { justifyContent: 'flex-end' },
  otherRow: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 18,
  },
  senderName: { fontSize: 11, marginBottom: 4, fontWeight: '600' },
  messageText: { fontSize: 15, lineHeight: 20 },
  messageImage: { width: 200, height: 150, borderRadius: 10, marginBottom: 8 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 25 : 10,
  },
  attachButton: { padding: 8 },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    maxHeight: 100,
    marginHorizontal: 8,
    borderWidth: 1,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closedBanner: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  downloadButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    padding: 10,
  },
  fullScreenImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
});

export default TicketDetailScreen;
