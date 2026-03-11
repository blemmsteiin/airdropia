import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert, TextInput, ActivityIndicator, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, getDoc, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

const AirdropDetailScreen = ({ route, navigation }) => {
  const { item, isDiscount = false } = route.params;
  const collectionName = isDiscount ? 'discounts' : 'airdrops';
  const { theme, isDarkMode } = useTheme();
  
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [inputRef, setInputRef] = useState(null); // Reference for TextInput to focus it
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingComments, setLoadingComments] = useState(true);
  const [sending, setSending] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState([]);
  const [usersWhoBlockedMe, setUsersWhoBlockedMe] = useState([]);
  const [userAvatars, setUserAvatars] = useState({});
  const [allUsers, setAllUsers] = useState([]); // All users for autocomplete
  const [mentionKeyword, setMentionKeyword] = useState(null); // Active search string (e.g. "ker")
  const [replyingTo, setReplyingTo] = useState(null); // { id, username }
  const [expandedReplies, setExpandedReplies] = useState({}); // { commentId: true/false }
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDescription, setEditDescription] = useState(item.description);
  const [editUrl, setEditUrl] = useState(item.url);
  const [editEndDate, setEditEndDate] = useState(item.endDate);
  const [editTargetAudience, setEditTargetAudience] = useState(item.targetAudience || 'everyone');
  const [editReward, setEditReward] = useState(item.reward || '');
  const [editDiscountPercentage, setEditDiscountPercentage] = useState(item.discountPercentage || '');
  const [editProfitAmount, setEditProfitAmount] = useState(item.profitAmount || '');
  const [editDiscountCode, setEditDiscountCode] = useState(item.discountCode || '');

  useEffect(() => {
    const checkAdmin = async () => {
      const adminCache = await AsyncStorage.getItem('isAdmin_cache');
      setIsAdmin(adminCache === 'true');
    };
    checkAdmin();

    // Kullanıcı engelleme listelerini çek
    let unsubscribeUserObj = () => {};
    let unsubscribeAllUsers = () => {};

    const q = query(
      collection(db, 'comments'), 
      where('airdropId', '==', item.id)
    );

    const unsubscribeComments = onSnapshot(q, (snapshot) => {
      const fetchedComments = [];
      snapshot.forEach(doc => {
        fetchedComments.push({ id: doc.id, ...doc.data() });
      });

      // Firebase index hatasına takılmamak için Javascript ile zamana göre sırala (Eskiden yeniye)
      fetchedComments.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeA - timeB; // Eskiler üstte, yeniler altta (WhatsApp tarzı)
      });

      setComments(fetchedComments);
      setLoadingComments(false);
    });

    // Herkes için tüm kullanıcıları ve avatarları çek (mention ve profil resimleri için)
    unsubscribeAllUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const avatarMap = {};
      const usersList = [];
      const whoBlockedMeIds = []; // currentUser'a bağlı
      
      snapshot.forEach(d => {
         const dData = d.data();
         
         if(dData.username) {
           usersList.push({ id: d.id, username: dData.username, role: dData.role });
         }
         
         if(dData.avatar) {
           avatarMap[d.id] = dData.avatar;
         }
         
         // Eğer currentUser varsa ve bu kişi currentUser'ı engellediyse:
         if(currentUser && dData.blockedUsers && dData.blockedUsers.includes(currentUser.uid)) {
           whoBlockedMeIds.push(d.id);
         }
      });
      
      setUsersWhoBlockedMe(whoBlockedMeIds);
      setUserAvatars(avatarMap);
      setAllUsers(usersList);
    });

    const setupBlockListeners = async (user) => {
      // Listen to my block list
      unsubscribeUserObj = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
        if(docSnap.exists() && docSnap.data().blockedUsers) {
          setBlockedByMe(docSnap.data().blockedUsers);
        } else {
          setBlockedByMe([]);
        }
      });
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if(user) {
        setupBlockListeners(user);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeComments();
      unsubscribeUserObj();
      unsubscribeAllUsers();
    };
  }, [item.id, currentUser?.uid]);

  const filteredComments = comments.filter(c => {
    if (!currentUser) return true;
    if (blockedByMe.includes(c.userId)) return false;
    if (usersWhoBlockedMe.includes(c.userId)) return false;
    return true;
  });

  // Separate top-level comments and replies
  const topLevelComments = filteredComments.filter(c => !c.parentId);
  const repliesMap = {};
  filteredComments.filter(c => c.parentId).forEach(reply => {
    if (!repliesMap[reply.parentId]) repliesMap[reply.parentId] = [];
    repliesMap[reply.parentId].push(reply);
  });

  const handlePostComment = async () => {
    if (!newComment.trim() || !currentUser) return;
    
    setSending(true);
    try {
      const isAdminFlag = await AsyncStorage.getItem('isAdmin_cache');
      const role = isAdminFlag === 'true' ? 'Yönetici' : 'Üye';
      const senderName = currentUser.displayName || currentUser.email.split('@')[0];
      const commentText = newComment.trim();

      const commentRef = await addDoc(collection(db, 'comments'), {
        airdropId: item.id,
        userId: currentUser.uid,
        username: senderName,
        role: role,
        text: commentText,
        parentId: replyingTo ? replyingTo.id : null,
        createdAt: serverTimestamp()
      });

      // 1. Eğer doğrudan bir yoruma yanıt veriliyorsa (reply butonuna basıldıysa) garanti bildirim
      if (replyingTo && replyingTo.userId && replyingTo.userId !== currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
          recipientId: replyingTo.userId,
          senderId: currentUser.uid,
          senderName: senderName,
          type: 'mention',
          airdropId: item.id,
          airdropTitle: item.title,
          text: commentText,
          commentId: commentRef.id,
          read: false,
          createdAt: serverTimestamp()
        });
      }

      // 2. Metin içi manuel etiketlemeler (fallback)
      const mentionRegex = /@([a-zA-Z0-9_ğüşıöçĞÜŞİÖÇ]+)/g;
      const mentions = [];
      let match;
      while ((match = mentionRegex.exec(commentText)) !== null) {
        mentions.push(match[1]);
      }

      if (mentions.length > 0) {
        // Find users by username and send notifications
        const usersRef = collection(db, 'users');
        for (const username of mentions) {
          const userQuery = query(usersRef, where('username', '==', username));
          const userSnap = await getDocs(userQuery);
          
          userSnap.forEach(async (userDoc) => {
            // Don't notify yourself and don't notify admins check case-insensitively
            if (userDoc.id !== currentUser.uid && userDoc.data().role?.toLowerCase() !== 'admin') {
              await addDoc(collection(db, 'notifications'), {
                recipientId: userDoc.id,
                senderId: currentUser.uid,
                senderName: senderName,
                type: 'mention',
                airdropId: item.id,
                airdropTitle: item.title,
                text: commentText,
                commentId: commentRef.id,
                read: false,
                createdAt: serverTimestamp()
              });
            }
          });
        }
      }

      setNewComment('');
      setReplyingTo(null);
    } catch (error) {
      Alert.alert('Hata', 'Yorum gönderilemedi.');
      console.log(error);
    }
    setSending(false);
  };

  const handleJoin = async () => {
    try {
      if (item.url && item.url.startsWith('http')) {
        await Linking.openURL(item.url);
      } else {
        Alert.alert('Hata', 'Geçerli bir URL bulunamadı.');
      }
    } catch (error) {
      Alert.alert('Hata', 'Link açılamadı.');
    }
  };

  const handleFinishAirdrop = async () => {
    Alert.alert(
      "Airdrop'u Bitir",
      "Bu airdrop'u bitmiş olarak işaretlemek istediğinize emin misiniz?",
      [
        { text: "İptal", style: "cancel" },
        { 
          text: "Evet, Bitir", 
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, collectionName, item.id), { status: 'finished' });
              Alert.alert('Başarılı', "Airdrop 'Bitmiş' statüsüne taşındı.");
              navigation.goBack();
            } catch (error) {
              Alert.alert('Hata', 'İşlem başarısız oldu.');
              console.log(error);
            }
          }
        }
      ]
    );
  };

  const handleToggleComments = async () => {
    const currentStatus = item.commentsEnabled !== false;
    try {
      await updateDoc(doc(db, collectionName, item.id), { commentsEnabled: !currentStatus });
      Alert.alert('Başarılı', `Yorumlar ${!currentStatus ? 'Açıldı' : 'Kapatıldı'}. Lütfen değişiklikleri görmek için sayfayı yenileyin.`);
    } catch (error) {
      Alert.alert('Hata', 'İşlem başarısız oldu.');
      console.log(error);
    }
  };

  const handleDeleteAirdrop = () => {
    Alert.alert(
      "Airdrop'u Sil",
      "Bu airdrop'u ve tüm yorumlarını kalıcı olarak silmek istediğinize emin misiniz?",
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Sil",
          style: "destructive",
          onPress: async () => {
            try {
              // Delete all comments for this airdrop
              const commentsQuery = query(collection(db, 'comments'), where('airdropId', '==', item.id));
              const commentsSnap = await getDocs(commentsQuery);
              const deletePromises = [];
              commentsSnap.forEach(commentDoc => {
                deletePromises.push(deleteDoc(doc(db, 'comments', commentDoc.id)));
              });
              await Promise.all(deletePromises);
              // Delete the airdrop
              await deleteDoc(doc(db, collectionName, item.id));
              Alert.alert('Başarılı', 'Airdrop silindi.');
              navigation.goBack();
            } catch (error) {
              Alert.alert('Hata', 'Airdrop silinemedi.');
              console.log(error);
            }
          }
        }
      ]
    );
  };

  const getAudienceLabel = (audience) => {
    switch(audience) {
      case 'new': return '🆕 Yeni Üyeler İçin';
      case 'old': return '🔄 Eski Üyeler İçin';
      default: return '🌍 Herkes İçin';
    }
  };

  const handleSaveEdit = async () => {
    if (!editTitle || !editDescription) {
      Alert.alert('Hata', 'Başlık ve açıklama boş olamaz.');
      return;
    }
    try {
      const updateData = {
        title: editTitle,
        description: editDescription,
        url: editUrl,
        endDate: editEndDate,
      };

      if (isDiscount) {
        if (editDiscountPercentage && editProfitAmount) {
          Alert.alert('Hata', 'Lütfen sadece İndirim Yüzdesi YA DA Kazanç miktarından birini doldurun.');
          return;
        }
        updateData.discountPercentage = editDiscountPercentage;
        updateData.profitAmount = editProfitAmount;
        updateData.discountCode = editDiscountCode;
      } else {
        updateData.targetAudience = editTargetAudience;
        updateData.reward = editReward;
      }

      await updateDoc(doc(db, collectionName, item.id), updateData);
      
      item.title = editTitle;
      item.description = editDescription;
      item.url = editUrl;
      item.endDate = editEndDate;
      
      if (isDiscount) {
        item.discountPercentage = editDiscountPercentage;
        item.profitAmount = editProfitAmount;
        item.discountCode = editDiscountCode;
      } else {
        item.targetAudience = editTargetAudience;
        item.reward = editReward;
      }
      
      setIsEditing(false);
      Alert.alert('Başarılı', 'Airdrop güncellendi.');
    } catch (error) {
      Alert.alert('Hata', 'Güncelleme başarısız oldu.');
      console.log(error);
    }
  };

  const handleDeleteComment = (commentId) => {
    Alert.alert(
      "Yorumu Sil",
      "Bu yorumu kalıcı olarak silmek istediğinize emin misiniz?",
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Sil",
          style: "destructive",
          onPress: async () => {
            try {
              // Yorumu sil
              await deleteDoc(doc(db, 'comments', commentId));
              
              // Bu yorumla ilişkilendirilmiş bildirimleri sil (Etiketlemeler ve Yanıtlar)
              const notifsQuery = query(collection(db, 'notifications'), where('commentId', '==', commentId));
              const notifsSnap = await getDocs(notifsQuery);
              const deletePromises = [];
              notifsSnap.forEach(notifDoc => {
                deletePromises.push(deleteDoc(doc(db, 'notifications', notifDoc.id)));
              });
              await Promise.all(deletePromises);
              
            } catch (error) {
              Alert.alert('Hata', 'Yorum veya bildirim silinemedi.');
            }
          }
        }
      ]
    );
  };

  const handleReply = (comment) => {
    setReplyingTo({ id: comment.id, username: comment.username, userId: comment.userId });
    handleCommentChange(`@${comment.username} `);
  };

  const toggleReplies = (commentId) => {
    setExpandedReplies(prev => ({ ...prev, [commentId]: !prev[commentId] }));
  };

  const handleCommentChange = (text) => {
    setNewComment(text);
    
    // Check if the user is currently typing a mention
    const words = text.split(/\s+/);
    const lastWord = words[words.length - 1];
    
    if (lastWord.startsWith('@')) {
      // Extract the keyword after '@'
      const keyword = lastWord.substring(1).toLowerCase();
      // Yöneticileri engelleyeceğiz ve 3 karakterden azsa listeyi göstermeyeceğiz
      if (keyword.length >= 3) {
        setMentionKeyword(keyword);
      } else {
        setMentionKeyword(null);
      }
    } else {
      setMentionKeyword(null);
    }
  };

  const handleSelectMention = (user) => {
    if (!mentionKeyword) return;
    
    // Replace the partial mention with the full username
    const words = newComment.split(/\s+/);
    words.pop(); // Remove the partial @keyword
    
    const newText = words.length > 0 
      ? words.join(' ') + ` @${user.username} `
      : `@${user.username} `;
      
    setNewComment(newText);
    setMentionKeyword(null);
  };

  const renderTextWithMentions = (text) => {
    if (!text) return null;
    
    // Split text by @mentions (keeping the matched string to style it)
    const mentionRegex = /(@[a-zA-Z0-9_ğüşıöçĞÜŞİÖÇ]+)/g;
    const parts = text.split(mentionRegex);
    
    return parts.map((part, index) => {
      if (part.match(mentionRegex)) {
        const username = part.substring(1).toLowerCase();
        const mentionedUser = allUsers.find(u => u.username?.toLowerCase() === username);

        // Yöneticilerin etiketlenmesini engelle
        if (mentionedUser && mentionedUser.role?.toLowerCase() !== 'admin') {
          return (
            <Text 
              key={index} 
              style={{ color: '#007AFF', fontWeight: 'bold' }}
              onPress={() => navigation.navigate('PublicProfile', { userId: mentionedUser.id })}
            >
              {part}
            </Text>
          );
        } else {
          // If user doesn't exist in the local list (or is an admin), just bold it but no link
          return (
            <Text key={index} style={{ color: theme.textSecondary, fontWeight: 'bold' }}>
              {part}
            </Text>
          );
        }
      }
      return <Text key={index}>{part}</Text>;
    });
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background }]}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Başlık ve Durum */}
        <View style={[styles.headerCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
          {isEditing ? (
            <TextInput
              style={[styles.editInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Başlık"
              placeholderTextColor={theme.textSecondary}
            />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'flex-start', marginBottom: 8 }}>
              <Text style={[styles.title, { color: theme.text, flexShrink: 1 }]}>{item.title}</Text>
              {isDiscount && (
                <>
                  {item.discountPercentage ? (
                    <View style={[styles.discountBadgeDetail, { backgroundColor: '#007AFF' }]}>
                      <Text style={styles.discountBadgeDetailText}>{item.discountPercentage}</Text>
                    </View>
                  ) : item.profitAmount ? (
                    <View style={[styles.discountBadgeDetail, { backgroundColor: '#34C759' }]}>
                      <Text style={styles.discountBadgeDetailText}>{item.profitAmount}</Text>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          )}
          <View style={styles.statusRow}>
            {isEditing ? (
              <TextInput
                style={[styles.editInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background, flex: 1 }]}
                value={editEndDate}
                onChangeText={setEditEndDate}
                placeholder="Son Katılım Tarihi"
                placeholderTextColor={theme.textSecondary}
              />
            ) : (
              <Text style={[styles.date, { color: theme.textSecondary }]}>Son Katılım: {item.endDate}</Text>
            )}
            <View style={[styles.statusBadge, { backgroundColor: item.status === 'active' ? '#34C759' : '#666' }]}>
              <Text style={styles.statusText}>{item.status === 'active' ? 'Aktif' : 'Bitmiş'}</Text>
            </View>
          </View>

          {/* Hedef Kitle Badge */}
          {!isDiscount && (
            <View style={[styles.statusBadge, { backgroundColor: '#007AFF', marginTop: 8, alignSelf: 'flex-start' }]}>
              <Text style={styles.statusText}>{getAudienceLabel(item.targetAudience)}</Text>
            </View>
          )}

          {isEditing && !isDiscount && (
            <View style={{ marginTop: 12 }}>
              <Text style={[{ color: theme.text, fontWeight: 'bold', marginBottom: 6 }]}>Hedef Kitle:</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['everyone', 'new', 'old'].map(opt => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setEditTargetAudience(opt)}
                    style={[styles.statusBadge, { backgroundColor: editTargetAudience === opt ? '#007AFF' : theme.border }]}
                  >
                    <Text style={[styles.statusText, { color: editTargetAudience === opt ? '#fff' : theme.text }]}>
                      {opt === 'everyone' ? 'Herkes' : opt === 'new' ? 'Yeni' : 'Eski'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          
          {isAdmin && (
            <View style={{ marginTop: 12 }}>
              {item.status === 'active' && (
                <TouchableOpacity 
                  style={[styles.adminActionButton, { backgroundColor: '#FF3B30', marginBottom: 8 }]} 
                  onPress={handleFinishAirdrop}
                >
                  <Text style={styles.adminActionText}>⚙️ Bu Airdrop'u Bitir</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity 
                style={[styles.adminActionButton, { backgroundColor: isEditing ? '#34C759' : '#007AFF', marginBottom: 8 }]} 
                onPress={isEditing ? handleSaveEdit : () => setIsEditing(true)}
              >
                <Text style={styles.adminActionText}>{isEditing ? '✅ Kaydet' : '✏️ Düzenle'}</Text>
              </TouchableOpacity>

              {isEditing && (
                <TouchableOpacity 
                  style={[styles.adminActionButton, { backgroundColor: '#666', marginBottom: 8 }]} 
                  onPress={() => {
                    setIsEditing(false);
                    setEditTitle(item.title);
                    setEditDescription(item.description);
                    setEditUrl(item.url);
                    setEditEndDate(item.endDate);
                    setEditTargetAudience(item.targetAudience || 'everyone');
                    setEditReward(item.reward || '');
                    setEditDiscountPercentage(item.discountPercentage || '');
                    setEditProfitAmount(item.profitAmount || '');
                    setEditDiscountCode(item.discountCode || '');
                  }}
                >
                  <Text style={styles.adminActionText}>❌ İptal</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={[styles.adminActionButton, { backgroundColor: '#FF9500' }]} 
                onPress={handleToggleComments}
              >
                <Text style={styles.adminActionText}>
                  {item.commentsEnabled !== false ? '🚫 Yorumları Kapat' : '✅ Yorumları Aç'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.adminActionButton, { backgroundColor: '#8B0000', marginTop: 8 }]} 
                onPress={handleDeleteAirdrop}
              >
                <Text style={styles.adminActionText}>🗑️ Airdrop'u Sil</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Açıklama */}
        <View style={[styles.descCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
          {/* İndirim Yüzdesi veya Kampanya Ödülü */}
          {isDiscount ? (
            <View>
              {isEditing && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[{ color: theme.text, fontWeight: 'bold', fontSize: 15, marginBottom: 4 }]}>🏷️ İndirim Yüzdesi / Kazanç Miktarı:</Text>
                  <TextInput
                    style={[styles.editInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background, marginBottom: 8 }]}
                    value={editDiscountPercentage}
                    onChangeText={setEditDiscountPercentage}
                    placeholder="İndirim Yüzdesi (örn. %50) [Kazanç ile aynı anda girilmez]"
                    placeholderTextColor={theme.textSecondary}
                  />
                  <TextInput
                    style={[styles.editInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                    value={editProfitAmount}
                    onChangeText={setEditProfitAmount}
                    placeholder="Kazanç Miktarı (örn. 50 TL) [Yüzde ile aynı anda girilmez]"
                    placeholderTextColor={theme.textSecondary}
                  />
                </View>
              )}
              
              {(item.discountCode || isEditing) && (
                <View style={[styles.discountCodeContainer, { backgroundColor: isDarkMode ? '#1e1e1e' : '#F9F9F9', borderColor: theme.border }]}>
                  <Text style={[styles.discountCodeLabel, { color: theme.textSecondary }]}>Kupon Kodu</Text>
                  {isEditing ? (
                    <TextInput
                      style={[styles.editInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card, textAlign: 'center', fontSize: 20, fontWeight: 'bold' }]}
                      value={editDiscountCode}
                      onChangeText={setEditDiscountCode}
                      placeholder="GHOST50"
                      placeholderTextColor={theme.textSecondary}
                    />
                  ) : (
                    <View style={[styles.discountCodeBox, { backgroundColor: isDarkMode ? '#333' : '#000' }]}>
                      <Text selectable={true} style={styles.discountCodeText}>{item.discountCode}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          ) : (
            (item.reward || isEditing) && (
              <View style={{ marginBottom: 12 }}>
                <Text style={[{ color: theme.text, fontWeight: 'bold', fontSize: 15, marginBottom: 4 }]}>🏆 Kampanya Ödülü:</Text>
                {isEditing ? (
                  <TextInput
                    style={[styles.editInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                    value={editReward}
                    onChangeText={setEditReward}
                    placeholder="Ödül (örn. 500 USDT)"
                    placeholderTextColor={theme.textSecondary}
                  />
                ) : (
                  <Text selectable={true} style={[{ color: '#34C759', fontSize: 16, fontWeight: '600' }]}>{item.reward}</Text>
                )}
              </View>
            )
          )}

          {/* Ödül Dağıtım Tarihi */}
          {item.rewardDate ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={[{ color: theme.text, fontWeight: 'bold', fontSize: 15, marginBottom: 4 }]}>📅 Ödül Dağıtım Tarihi:</Text>
              <Text style={[{ color: '#FF9500', fontSize: 16, fontWeight: '600' }]}>{item.rewardDate}</Text>
            </View>
          ) : null}

          {/* Davet Kodu */}
          {item.inviteCode ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={[{ color: theme.text, fontWeight: 'bold', fontSize: 15, marginBottom: 4 }]}>🔗 Davet Kodu:</Text>
              <Text selectable={true} style={[{ color: '#007AFF', fontSize: 16, fontWeight: '600' }]}>{item.inviteCode}</Text>
            </View>
          ) : null}

          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {isDiscount ? 'İndirim Detayları' : 'Airdrop Detayları'}
          </Text>
          {isEditing ? (
            <TextInput
              style={[styles.editInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background, height: 100, textAlignVertical: 'top' }]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="Açıklama"
              placeholderTextColor={theme.textSecondary}
              multiline
            />
          ) : (
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              {item.description}
            </Text>
          )}
        </View>

        {/* Katıl Butonu */}
        <TouchableOpacity 
          style={[styles.button, item.status === 'finished' && styles.buttonDisabled]} 
          onPress={handleJoin}
          disabled={item.status === 'finished'}
        >
          <Text style={styles.buttonText}>
            {item.status === 'active' ? (isDiscount ? 'İndirimi Kap!' : 'Airdrop\'a Katıl') : 'Süresi Doldu (Link Kapalı)'}
          </Text>
        </TouchableOpacity>

        {/* Gelecekte Yorumlar Buraya Gelecek */}
        <View style={styles.commentsSection}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Yorumlar ({filteredComments.length})</Text>
          
          {loadingComments ? (
            <ActivityIndicator color={theme.primary} style={{ marginVertical: 20 }} />
          ) : topLevelComments.length === 0 ? (
            <Text style={[styles.emptyCommentText, { color: theme.textSecondary }]}>Görüntülenecek yorum yok.</Text>
          ) : (
            topLevelComments.map(comment => {
              const replies = repliesMap[comment.id] || [];
              const isExpanded = expandedReplies[comment.id];
              return (
                <View key={comment.id}>
                  <View style={[styles.commentBubble, { backgroundColor: theme.card, shadowColor: theme.text }]}>
                    <View style={styles.commentHeader}>
                      <TouchableOpacity onPress={() => navigation.navigate('PublicProfile', { userId: comment.userId })} style={{ marginRight: 8 }}>
                        {userAvatars[comment.userId] ? (
                          <Image source={{ uri: userAvatars[comment.userId] }} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: theme.border }} />
                        ) : (
                          <Ionicons name="person-circle-outline" size={32} color={theme.textSecondary} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => navigation.navigate('PublicProfile', { userId: comment.userId })} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <Text style={[styles.commentUser, { color: theme.text }]}>{comment.username}</Text>
                        {comment.role === 'Yönetici' && (
                          <Ionicons name="checkmark-circle" size={16} color="#1DA1F2" style={{ marginLeft: 4 }} />
                        )}
                      </TouchableOpacity>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {currentUser && (
                          <TouchableOpacity onPress={() => handleReply(comment)} style={{ marginRight: 10 }}>
                            <Text style={{ color: theme.primary, fontSize: 13, fontWeight: 'bold' }}>Cevapla</Text>
                          </TouchableOpacity>
                        )}
                        {(isAdmin || (currentUser && currentUser.uid === comment.userId)) && (
                          <TouchableOpacity onPress={() => handleDeleteComment(comment.id)} style={styles.deleteCommentBtn}>
                            <Text style={styles.deleteCommentText}>🗑️</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <Text style={[styles.commentText, { color: theme.textSecondary }]}>
                      {renderTextWithMentions(comment.text)}
                    </Text>
                    
                    {/* Reply toggle */}
                    {replies.length > 0 && (
                      <TouchableOpacity onPress={() => toggleReplies(comment.id)} style={{ marginTop: 8 }}>
                        <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '600' }}>
                          {isExpanded ? '▲ Yanıtları gizle' : `💬 ${replies.length} yanıt görüntüle`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Replies */}
                  {isExpanded && replies.map(reply => (
                    <View key={reply.id} style={[styles.commentBubble, { backgroundColor: theme.card, shadowColor: theme.text, marginLeft: 32, borderLeftWidth: 3, borderLeftColor: theme.primary }]}>
                      <View style={styles.commentHeader}>
                        <TouchableOpacity onPress={() => navigation.navigate('PublicProfile', { userId: reply.userId })} style={{ marginRight: 8 }}>
                          {userAvatars[reply.userId] ? (
                            <Image source={{ uri: userAvatars[reply.userId] }} style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: theme.border }} />
                          ) : (
                            <Ionicons name="person-circle-outline" size={26} color={theme.textSecondary} />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => navigation.navigate('PublicProfile', { userId: reply.userId })} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <Text style={[styles.commentUser, { color: theme.text, fontSize: 13 }]}>{reply.username}</Text>
                          {reply.role === 'Yönetici' && (
                            <Ionicons name="checkmark-circle" size={14} color="#1DA1F2" style={{ marginLeft: 4 }} />
                          )}
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {currentUser && (
                            <TouchableOpacity onPress={() => { setReplyingTo({ id: comment.id, username: reply.username, userId: reply.userId }); handleCommentChange(`@${reply.username} `); }} style={{ marginRight: 10 }}>
                              <Text style={{ color: theme.primary, fontSize: 12, fontWeight: 'bold' }}>Cevapla</Text>
                            </TouchableOpacity>
                          )}
                          {(isAdmin || (currentUser && currentUser.uid === reply.userId)) && (
                            <TouchableOpacity onPress={() => handleDeleteComment(reply.id)} style={styles.deleteCommentBtn}>
                              <Text style={styles.deleteCommentText}>🗑️</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                      <Text style={[styles.commentText, { color: theme.textSecondary, fontSize: 13 }]}>
                        {renderTextWithMentions(reply.text)}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })
          )}

          {/* Yorum Ekleme Alanı - Sadece Yorumlara Açıksa Veya Adminse Gözüksün */}
          {item.commentsEnabled !== false || isAdmin ? (
            <View>
              {replyingTo && (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.card, borderRadius: 8, marginBottom: 4 }}>
                  <Text style={{ color: theme.textSecondary, flex: 1, fontSize: 13 }}>↩️ {replyingTo.username} adlı kişiye yanıt veriyorsunuz</Text>
                  <TouchableOpacity onPress={() => { setReplyingTo(null); setNewComment(''); }}>
                    <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}
              {/* Autocomplete Dropdown */}
              {mentionKeyword !== null && (
                <View style={[styles.autocompleteContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  {allUsers.filter(u => u.username && u.username.toLowerCase().includes(mentionKeyword) && u.role?.toLowerCase() !== 'admin').length > 0 ? (
                    <ScrollView style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                      {allUsers
                        .filter(u => u.username && u.username.toLowerCase().includes(mentionKeyword) && u.role?.toLowerCase() !== 'admin')
                        .map(u => (
                          <TouchableOpacity 
                            key={u.id} 
                            style={[styles.autocompleteItem, { borderBottomColor: theme.border }]}
                            onPress={() => handleSelectMention(u)}
                          >
                            <Text style={{ color: theme.text, fontWeight: 'bold' }}>@{u.username}</Text>
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  ) : (
                    <View style={{ padding: 12 }}>
                      <Text style={{ color: theme.textSecondary, fontStyle: 'italic', fontSize: 13 }}>Kullanıcı bulunamadı</Text>
                    </View>
                  )}
                </View>
              )}

              <View style={[styles.commentInputContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.commentInput, { color: theme.text }]}
                  placeholder={replyingTo ? 'Yanıtınızı yazın...' : 'Yorumunuzu yazın...'}
                  placeholderTextColor={theme.textSecondary}
                  value={newComment}
                  onChangeText={handleCommentChange}
                  multiline
                />
                <TouchableOpacity 
                  style={[styles.sendButton, { backgroundColor: theme.primary }, !newComment.trim() && { opacity: 0.5 }]} 
                  onPress={handlePostComment}
                  disabled={sending || !newComment.trim()}
                >
                  {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendButtonText}>Gönder</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ marginTop: 20, alignItems: 'center' }}>
              <Text style={{ color: theme.textSecondary, fontStyle: 'italic' }}>Bu airdrop yorumlara kapatılmıştır.</Text>
            </View>
          )}
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
    padding: 16,
    paddingBottom: 40,
  },
  headerCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  discountBadgeDetail: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 10,
  },
  discountBadgeDetailText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  discountCodeContainer: {
    marginBottom: 20,
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#EFEFEF',
    borderStyle: 'dashed',
  },
  discountCodeLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  discountCodeBox: {
    backgroundColor: '#000',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  discountCodeText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  descCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  buttonDisabled: {
    backgroundColor: '#aaa',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  commentsSection: {
    marginTop: 8,
  },
  emptyCommentText: {
    fontStyle: 'italic',
    marginBottom: 16,
  },
  commentBubble: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentUser: {
    fontWeight: 'bold',
    fontSize: 14,
    marginRight: 8,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  adminBadge: {
    backgroundColor: '#FF3B30', // Kırmızımsı admin rengi
  },
  memberBadge: {
    backgroundColor: '#007AFF', // Mavi üye rengi
  },
  roleText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  commentText: {
    fontSize: 14,
    lineHeight: 20,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    marginTop: 16,
  },
  commentInput: {
    flex: 1,
    maxHeight: 100,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  sendButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  adminActionButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminActionText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  deleteCommentBtn: {
    padding: 4,
    marginLeft: 8,
  },
  deleteCommentText: {
    fontSize: 16,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    fontSize: 16,
  },
  autocompleteContainer: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
    marginHorizontal: 12,
    overflow: 'hidden',
    elevation: 3,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  autocompleteItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
});

export default AirdropDetailScreen;
