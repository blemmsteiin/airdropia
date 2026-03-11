import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert, PanResponder, Modal } from 'react-native';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, where, doc, setDoc, updateDoc, arrayUnion, arrayRemove, increment, deleteDoc, getDocs, limit, getDoc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { db, auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

const ChatDetailScreen = ({ route, navigation }) => {
  const { theme } = useTheme();
  const { otherUser } = route.params;
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const [isImageModalVisible, setImageModalVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const [downloading, setDownloading] = useState(false);
  
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingInterval, setRecordingInterval] = useState(null);
  
  const startRecordingRef = useRef(() => {});
  const stopRecordingRef = useRef(() => {});
  const cancelRecordingRef = useRef(() => {});
  const isCanceledRef = useRef(false);

  useEffect(() => {
    startRecordingRef.current = startRecording;
    stopRecordingRef.current = stopRecording;
    cancelRecordingRef.current = cancelRecording;
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isCanceledRef.current = false;
        startRecordingRef.current();
      },
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dx < -50 && !isCanceledRef.current) {
          isCanceledRef.current = true;
          cancelRecordingRef.current();
        }
      },
      onPanResponderRelease: () => {
        if (!isCanceledRef.current) {
          stopRecordingRef.current();
        }
      },
      onPanResponderTerminate: () => {
        if (!isCanceledRef.current) {
          cancelRecordingRef.current();
        }
      }
    })
  ).current;

  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockedByOther, setBlockedByOther] = useState(false);

  const currentUser = auth.currentUser;

  // Generate a unique Room ID based on both UIDs to ensure they share the same room
  const getRoomId = (uid1, uid2) => {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
  };

  const roomId = getRoomId(currentUser.uid, otherUser.uid);

  useEffect(() => {
    // Set Navigation Header Title
    const otherUserName = otherUser.username || otherUser.email?.split('@')[0];
    
    // Header navigation options set below after state listeners
    if (!currentUser) return;

    // Fetch messages for this specific room
    const q = query(
      collection(db, 'chats', roomId, 'messages'),
      orderBy('createdAt', 'desc')
    );

    // Clear unread badge
    const clearUnread = async () => {
      try {
        const roomRef = doc(db, 'chats', roomId);
        const roomDoc = await getDoc(roomRef);
        if (roomDoc.exists() && roomDoc.data().unreadBy === currentUser.uid) {
          await updateDoc(roomRef, {
            unreadBy: null,
            unreadCount: 0
          });
        }
      } catch (e) { console.log('Error clearing unread:', e); }
    };
    clearUnread();

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!(data.deletedFor && data.deletedFor.includes(currentUser.uid))) {
          msgs.push({ id: docSnap.id, ...data });
        }
      });
      setMessages(msgs);
      setLoading(false);
    });

    // Listen to my block list
    const unsubscribeMe = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
      if(docSnap.exists() && docSnap.data().blockedUsers?.includes(otherUser.uid)) {
        setBlockedByMe(true);
      } else {
        setBlockedByMe(false);
      }
    });

    // Listen to other user's block list
    const unsubscribeOther = onSnapshot(doc(db, 'users', otherUser.uid), (docSnap) => {
      if(docSnap.exists() && docSnap.data().blockedUsers?.includes(currentUser.uid)) {
        setBlockedByOther(true);
      } else {
        setBlockedByOther(false);
      }
    });

    // Auto-unblock if the other user is an admin
    if (otherUser.role === 'admin' && blockedByMe) {
      const unblockAdmin = async () => {
        try {
          await updateDoc(doc(db, 'users', currentUser.uid), {
            blockedUsers: arrayRemove(otherUser.uid)
          });
          setBlockedByMe(false);
          console.log('Admin automatically unblocked');
        } catch (e) { console.log('Error auto-unblocking admin:', e); }
      };
      unblockAdmin();
    }

    return () => {
      unsubscribe();
      unsubscribeMe();
      unsubscribeOther();
    };
  }, [currentUser, roomId, otherUser, blockedByMe]);

  const toggleBlock = async () => {
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      if (blockedByMe) {
        await updateDoc(userRef, {
          blockedUsers: arrayRemove(otherUser.uid)
        });
        Alert.alert('Bilgi', 'Engeli kaldırdınız.');
      } else {
        await updateDoc(userRef, {
          blockedUsers: arrayUnion(otherUser.uid)
        });
        Alert.alert('Bilgi', 'Kullanıcıyı engellediniz. Artık birbirinize mesaj gönderemeyecek ve yorumlarınızı göremeyeceksiniz.');
      }
    } catch (e) {
      console.log('Error toggling block:', e);
      Alert.alert('Hata', 'İşlem başarısız oldu.');
    }
  };

  const openActionMenu = () => {
    // If other user is admin, don't show block option
    if (otherUser.role === 'admin') {
      Alert.alert('Bilgi', 'Yöneticileri engelleyemezsiniz.');
      return;
    }
    Alert.alert(
      "Seçenekler",
      "Ne yapmak istiyorsunuz?",
      [
        { text: "İptal", style: "cancel" },
        { 
          text: blockedByMe ? "Engeli Kaldır" : "Kişiyi Engelle", 
          style: blockedByMe ? "default" : "destructive",
          onPress: toggleBlock
        }
      ]
    );
  };

  useEffect(() => {
    const otherUserName = otherUser.username || otherUser.email?.split('@')[0];
    
    navigation.setOptions({ 
      headerTitle: () => (
        <TouchableOpacity 
          style={{ flexDirection: 'row', alignItems: 'center' }} 
          onPress={() => navigation.navigate('PublicProfile', { userId: otherUser.uid || otherUser.id })}
        >
          {otherUser.avatar ? (
            <Image source={{ uri: otherUser.avatar }} style={{ width: 32, height: 32, borderRadius: 16, marginRight: 10, borderWidth: 1, borderColor: theme.border }} />
          ) : (
            <Ionicons name="person-circle-outline" size={32} color={theme.textSecondary} style={{ marginRight: 10 }} />
          )}
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: theme.text }}>{otherUserName}</Text>
          {otherUser.role === 'admin' && (
             <Ionicons name="checkmark-circle" size={16} color="#1DA1F2" style={{ marginLeft: 4 }} />
          )}
        </TouchableOpacity>
      ),
      // Block işlemi Public Profile'a taşındığı için headerRight'taki üç noktayı kaldırdık.
    });
  }, [navigation, otherUser, theme, blockedByMe]);

  const handleSend = async (mediaData = null, mediaType = 'image') => {
    if ((!newMessage.trim() && !mediaData) || !currentUser) return;
    if (blockedByMe || blockedByOther) {
      Alert.alert('Hata', 'Engelleme sebebiyle mesaj gönderilemiyor.');
      return;
    }

    const messageToSend = newMessage;
    setNewMessage(''); // optimistic clear

    try {
      const dbPayload = {
        text: messageToSend,
        senderId: currentUser.uid,
        createdAt: serverTimestamp()
      };

      if (mediaData) {
        if (mediaType === 'image') {
          dbPayload.imageUrl = mediaData;
        } else if (mediaType === 'audio') {
          dbPayload.audioUrl = mediaData;
        }
      }

      await addDoc(collection(db, 'chats', roomId, 'messages'), dbPayload);

      let lastMessageStr = messageToSend;
      if (mediaData) {
        lastMessageStr = mediaType === 'image' ? '📷 Görsel' : '🎤 Ses Mesajı';
      }

      // Update parent document for recent chats list
      await setDoc(doc(db, 'chats', roomId), {
        lastMessage: lastMessageStr,
        lastUpdated: serverTimestamp(),
        participants: [currentUser.uid, otherUser.uid],
        unreadBy: otherUser.uid,
        [`lastMessageMap.${currentUser.uid}`]: lastMessageStr,
        [`lastMessageMap.${otherUser.uid}`]: lastMessageStr,
      }, { merge: true });

      // Increment unread count separately with updateDoc for reliable atomic increment
      await updateDoc(doc(db, 'chats', roomId), {
        unreadCount: increment(1)
      });
    } catch (error) {
      console.log('Error sending private message:', error);
      if (!mediaData) setNewMessage(messageToSend); // restore on failure
    }
  };

  const startRecording = async () => {
    if (blockedByMe || blockedByOther) {
      Alert.alert('Hata', 'Engelleme sebebiyle mesaj gönderilemiyor.');
      return;
    }
    if (isRecording || recording) {
      return; // Zaten kayıttayız, yeni kayıt açma hatasını engelle
    }
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status === 'granted') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        setRecording(recording);
        setIsRecording(true);
        setRecordingDuration(0);
        
        // Start duration timer
        const interval = setInterval(() => {
          setRecordingDuration(prev => prev + 1);
        }, 1000);
        setRecordingInterval(interval);

      } else {
        Alert.alert("İzin Gerekli", "Mikrofon izni reddedildi.");
      }
    } catch (err) {
      console.log('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    if (recordingInterval) {
      clearInterval(recordingInterval);
      setRecordingInterval(null);
    }

    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      const uri = recording.getURI();
      setRecording(null);
      setRecordingDuration(0);

      if (uri) {
        const base64Audio = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const audioDataString = `data:audio/m4a;base64,${base64Audio}`;
        handleSend(audioDataString, 'audio');
      }
    } catch (e) {
      console.log('Failed to stop recording', e);
      setRecordingDuration(0);
    }
  };

  const cancelRecording = async () => {
    setIsRecording(false);
    if (recordingInterval) {
      clearInterval(recordingInterval);
      setRecordingInterval(null);
    }

    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      setRecording(null);
      setRecordingDuration(0);
    } catch (e) {
      console.log('Failed to cancel recording', e);
      setRecordingDuration(0);
    }
  };

  const pickImage = async () => {
    if (blockedByMe || blockedByOther) {
      Alert.alert('Hata', 'Engelleme sebebiyle fotoğraf gönderilemiyor.');
      return;
    }

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert("İzin Gerekli", "Galeriye erişim izni vermeniz gerekiyor.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.3, // Sohbet içi resimler de kasmaması için düşük kalite
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const base64String = `data:image/jpeg;base64,${result.assets[0].base64}`;
      handleSend(base64String); // resmi seçer seçmez yolla
    }
  };

  const handleMessageLongPress = (item) => {
    const isMe = item.senderId === currentUser?.uid;

    if (isMe) {
      Alert.alert(
        "Mesaj Seçenekleri",
        "Bu mesaj için ne yapmak istiyorsunuz?",
        [
          { text: "İptal", style: "cancel" },
          { 
            text: "Benden Sil", 
            onPress: () => deleteMessageForMe(item.id) 
          },
          { 
            text: "Herkesten Sil", 
            style: "destructive",
            onPress: () => deleteMessageForEveryone(item.id) 
          }
        ]
      );
    } else {
      Alert.alert(
        "Mesaj Seçenekleri",
        "Bu mesaj için ne yapmak istiyorsunuz?",
        [
          { text: "İptal", style: "cancel" },
          { 
            text: "Benden Sil", 
            style: "destructive",
            onPress: () => deleteMessageForMe(item.id) 
          }
        ]
      );
    }
  };

  const deleteMessageForMe = async (messageId) => {
    try {
      await updateDoc(doc(db, 'chats', roomId, 'messages', messageId), {
        deletedFor: arrayUnion(currentUser.uid)
      });

      // Benden silince sohbet listesinde (ChatListScreen) son mesaj önizlemesini düzelt
      const q = query(
        collection(db, 'chats', roomId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      const snapshot = await getDocs(q);
      const validDocs = snapshot.docs.filter(d => {
        if (d.id === messageId) return false;
        const data = d.data();
        return !(data.deletedFor && data.deletedFor.includes(currentUser.uid));
      });
      
      let newLastMsg = '';
      if (validDocs.length > 0) {
        const lastMsgDoc = validDocs[0].data();
        newLastMsg = lastMsgDoc.text || '';
        if (lastMsgDoc.imageUrl) newLastMsg = '📷 Görsel';
        if (lastMsgDoc.audioUrl) newLastMsg = '🎤 Ses Mesajı';
      }
      
      await setDoc(doc(db, 'chats', roomId), {
        [`lastMessageMap.${currentUser.uid}`]: newLastMsg
      }, { merge: true });

    } catch (error) {
      console.log("Error hiding message:", error);
    }
  };

  const deleteMessageForEveryone = async (messageId) => {
    try {
      await deleteDoc(doc(db, 'chats', roomId, 'messages', messageId));

      // Kalan mesajlar arasında en yenisini bulup sohbet listesindeki 'son mesaj' önizlemesini güncelle
      const q = query(
        collection(db, 'chats', roomId, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(10) 
      );
      
      const snapshot = await getDocs(q);
      
      // Sildiğimiz mesajı sonuçlardan filtrele (race condition)
      const validDocs = snapshot.docs.filter(d => d.id !== messageId);
      
      if (validDocs.length > 0) {
        // Herkes için olan global lastMessage (fallback)
        const globalValidDocs = validDocs;
        const globalLastMsgDoc = globalValidDocs[0].data();
        let globalLastMsg = globalLastMsgDoc.text || '';
        if (globalLastMsgDoc.imageUrl) globalLastMsg = '📷 Görsel';
        if (globalLastMsgDoc.audioUrl) globalLastMsg = '🎤 Ses Mesajı';

        // Benim için olan lastMessageMap
        const myValidDocs = validDocs.filter(d => {
          const data = d.data();
          return !(data.deletedFor && data.deletedFor.includes(currentUser.uid));
        });
        let myLastMsg = globalLastMsg;
        if (myValidDocs.length > 0) {
          const mDoc = myValidDocs[0].data();
          myLastMsg = mDoc.text || '';
          if (mDoc.imageUrl) myLastMsg = '📷 Görsel';
          if (mDoc.audioUrl) myLastMsg = '🎤 Ses Mesajı';
        }

        // Karşı taraf için olan lastMessageMap
        const otherValidDocs = validDocs.filter(d => {
          const data = d.data();
          return !(data.deletedFor && data.deletedFor.includes(otherUser.uid));
        });
        let otherLastMsg = globalLastMsg;
        if (otherValidDocs.length > 0) {
          const oDoc = otherValidDocs[0].data();
          otherLastMsg = oDoc.text || '';
          if (oDoc.imageUrl) otherLastMsg = '📷 Görsel';
          if (oDoc.audioUrl) otherLastMsg = '🎤 Ses Mesajı';
        }
        
        await setDoc(doc(db, 'chats', roomId), {
          lastMessage: globalLastMsg,
          lastUpdated: globalLastMsgDoc.createdAt || serverTimestamp(),
          [`lastMessageMap.${currentUser.uid}`]: myLastMsg,
          [`lastMessageMap.${otherUser.uid}`]: otherLastMsg,
        }, { merge: true });
      } else {
        // Eğer grupta hiç mesaj kalmadıysa sohbet odasını tamamen sil
        await deleteDoc(doc(db, 'chats', roomId));
      }

    } catch (error) {
      console.log("Error deleting message:", error);
    }
  };

  const formatMessageDateHeader = (timestamp) => {
    const msgDate = timestamp && timestamp.toDate ? timestamp.toDate() : new Date();
    const today = new Date();
    
    const normalizedMsgDate = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());
    const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const diffTime = normalizedToday - normalizedMsgDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Bugün';
    if (diffDays === 1) return 'Dün';
    
    const options = { day: 'numeric', month: 'long' };
    if (msgDate.getFullYear() !== today.getFullYear()) {
      options.year = 'numeric';
    }
    return msgDate.toLocaleDateString('tr-TR', options);
  };

  const formatMessageTime = (timestamp) => {
    const date = timestamp && timestamp.toDate ? timestamp.toDate() : new Date();
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  const shouldShowDateHeader = (currentIndex, messagesArray) => {
    if (currentIndex === messagesArray.length - 1) return true;
    const currentMsg = messagesArray[currentIndex];
    const previousMsg = messagesArray[currentIndex + 1];
    
    if (!currentMsg?.createdAt || !previousMsg?.createdAt) return false;
    
    const currentDate = formatMessageDateHeader(currentMsg.createdAt);
    const prevDate = formatMessageDateHeader(previousMsg.createdAt);
    return currentDate !== prevDate;
  };

  const renderItem = ({ item, index }) => {
    const isMe = item.senderId === currentUser?.uid;
    
    // Check if message is deleted for current user
    if (item.deletedFor?.includes(currentUser.uid)) {
      return null;
    }

    const showDateHeader = shouldShowDateHeader(index, messages);
    const dateStr = formatMessageDateHeader(item.createdAt);
    const timeStr = formatMessageTime(item.createdAt);

    return (
      <View>
        {showDateHeader && (
          <View style={styles.dateHeaderContainer}>
            <View style={[styles.dateHeaderBadge, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }]}>
              <Text style={[styles.dateHeaderText, { color: theme.textSecondary }]}>{dateStr}</Text>
            </View>
          </View>
        )}
        <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
          {/* Karşı tarafın mesajıysa Profil Simgesi Göster */}
          {!isMe && (
            <TouchableOpacity 
              style={styles.avatarContainer}
              onPress={() => navigation.navigate('PublicProfile', { userId: otherUser.uid || otherUser.id })}
            >
              {otherUser.avatar ? (
                <Image source={{ uri: otherUser.avatar }} style={styles.chatAvatar} />
              ) : (
                <Ionicons name="person-circle-outline" size={30} color={theme.textSecondary} />
              )}
            </TouchableOpacity>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', flex: 1, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
            {isMe && (
              <Text style={[styles.messageTime, { marginRight: 8 }]}>{timeStr}</Text>
            )}

            <TouchableOpacity 
              style={[
                styles.messageBubble, 
                isMe ? [styles.myMessage, { backgroundColor: theme.primary }] : [styles.otherMessage, { backgroundColor: theme.card }],
              ]}
              onLongPress={() => handleMessageLongPress(item)}
              delayLongPress={300}
            >
              {item.imageUrl && (
                <TouchableOpacity onPress={() => { setSelectedImageUri(item.imageUrl); setImageModalVisible(true); }}>
                  <Image 
                    source={{ uri: item.imageUrl }} 
                    style={[styles.chatImage, { marginBottom: item.text ? 8 : 0 }]} 
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              )}
              {item.audioUrl && (
                <AudioPlayer audioBase64={item.audioUrl} isMe={isMe} theme={theme} />
              )}
              {item.text ? <Text style={{ color: isMe ? '#fff' : theme.text, fontSize: 16 }}>{item.text}</Text> : null}
            </TouchableOpacity>

            {!isMe && (
              <Text style={[styles.messageTime, { marginLeft: 8 }]}>{timeStr}</Text>
            )}
          </View>
        </View>
      </View>
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
      
      if (uri.startsWith('data:image')) {
        const base64Code = uri.split(',')[1];
        const tempUri = FileSystem.cacheDirectory + `chat_image_${Date.now()}.jpg`;
        await FileSystem.writeAsStringAsync(tempUri, base64Code, {
          encoding: FileSystem.EncodingType.Base64,
        });
        fileUri = tempUri;
      } else if (uri.startsWith('http')) {
        const tempUri = FileSystem.cacheDirectory + `chat_image_${Date.now()}.jpg`;
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
      <FlatList
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        inverted // Newest messages at bottom
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={{ padding: 20, alignItems: 'center', transform: [{ scaleY: -1 }] }}>
            <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
              Burası {otherUser.username || 'bu kişi'} ile aranızdaki özel sohbet odanız. İlk mesajı gönderin!
            </Text>
          </View>
        }
      />

      <View style={[styles.inputContainer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        {blockedByMe || blockedByOther ? (
           <View style={{ flex: 1, paddingVertical: 10, alignItems: 'center' }}>
             <Text style={{ color: '#FF3B30', fontWeight: 'bold' }}>
               {blockedByMe ? 'Bu kullanıcıyı engellediniz.' : 'Bu kişi tarafından engellendiniz.'}
             </Text>
           </View>
        ) : (
          <>
            {!isRecording ? (
              <>
                <TouchableOpacity 
                  style={styles.attachButton} 
                  onPress={pickImage}
                >
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
              </>
            ) : (
              <View style={[styles.input, styles.recordingContainer, { backgroundColor: theme.background, borderColor: '#FF3B30', paddingRight: 8 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[styles.recordingDot, { backgroundColor: '#FF3B30' }]} />
                  <Text style={{ color: '#FF3B30', fontWeight: 'bold', fontSize: 16, marginLeft: 8 }}>
                    {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:{(recordingDuration % 60).toString().padStart(2, '0')}
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {"<"} Sola kaydırıp iptal et
                  </Text>
                </View>
              </View>
            )}

            {newMessage.trim() ? (
              <TouchableOpacity 
                style={[styles.sendButton, { backgroundColor: theme.primary }]} 
                onPress={() => handleSend(null)}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            ) : (
              <View 
                {...panResponder.panHandlers}
                style={[styles.sendButton, { backgroundColor: isRecording ? '#FF3B30' : theme.border, padding: isRecording ? 18 : 14 }]} 
              >
                <Ionicons name={isRecording ? "mic" : "mic-outline"} size={isRecording ? 28 : 24} color={isRecording ? "#fff" : theme.textSecondary} />
              </View>
            )}
          </>
        )}
      </View>

      <Modal visible={isImageModalVisible} transparent={true} animationType="fade" onRequestClose={() => setImageModalVisible(false)}>
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.modalCloseButton} onPress={() => setImageModalVisible(false)}>
            <Ionicons name="close" size={36} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.downloadButton} onPress={() => handleDownloadImage(selectedImageUri)} disabled={downloading}>
            {downloading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="download-outline" size={36} color="#fff" />
            )}
          </TouchableOpacity>
          {selectedImageUri && (
            <Image source={{ uri: selectedImageUri }} style={styles.fullScreenImage} resizeMode="contain" />
          )}
        </View>
      </Modal>

    </KeyboardAvoidingView>
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
  listContainer: {
    padding: 16,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    marginRight: 8,
    marginBottom: 4,
  },
  chatAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 20,
  },
  myMessage: {
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    borderTopWidth: 1,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 10,
    fontSize: 15,
  },
  attachButton: {
    padding: 8,
    marginRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButton: {
    borderRadius: 20,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingLeft: 16,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  messageTime: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  dateHeaderContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  dateHeaderBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dateHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 30,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  downloadButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 30,
    left: 20,
    zIndex: 10,
    padding: 10,
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  }
});

const AudioPlayer = ({ audioBase64, isMe, theme }) => {
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  const playSound = async () => {
    if (isLoading) return;

    try {
      if (sound) {
        if (isPlaying) {
          await sound.pauseAsync();
          setIsPlaying(false);
        } else {
          await sound.playAsync();
          setIsPlaying(true);
        }
      } else {
        setIsLoading(true);
        // iOS AVFoundationErrorDomain -11828 hatasını önlemek için 
        // Base64 dizgesini geçici yerel dosyaya kaydedip öyle okutuyoruz
        const tempUri = FileSystem.cacheDirectory + `audio_${Date.now()}.m4a`;
        const base64Data = audioBase64.split('base64,')[1];

        if (!base64Data) {
          console.log("Geçersiz ses verisi");
          setIsLoading(false);
          return;
        }

        await FileSystem.writeAsStringAsync(tempUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: tempUri },
          { shouldPlay: true }
        );
        newSound.setOnPlaybackStatusUpdate((status) => {
          if (status.didJustFinish) {
            setIsPlaying(false);
            newSound.setPositionAsync(0);
          }
        });
        setSound(newSound);
        setIsPlaying(true);
        setIsLoading(false);
      }
    } catch (e) {
      console.log('Error playing audio', e);
      setIsLoading(false);
    }
  };

  return (
    <TouchableOpacity onPress={playSound} style={{ flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)', borderRadius: 12, marginBottom: 4 }}>
      {isLoading ? (
        <ActivityIndicator size="small" color={isMe ? '#fff' : theme.primary} style={{ width: 24, height: 24 }} />
      ) : (
        <Ionicons name={isPlaying ? "pause" : "play"} size={24} color={isMe ? '#fff' : theme.primary} />
      )}
      <Text style={{ marginLeft: 8, color: isMe ? '#fff' : theme.text, fontWeight: 'bold' }}>
        {isLoading ? 'Yükleniyor...' : 'Sesi Dinle'}
      </Text>
    </TouchableOpacity>
  );
};

export default ChatDetailScreen;
