import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';

const NotificationsScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Firebase index hatasını önlemek için client-side sıralama
      fetched.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });

      setNotifications(fetched);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handlePressNotification = async (item) => {
    // Mark as read
    if (!item.read) {
      await updateDoc(doc(db, 'notifications', item.id), { read: true });
    }

    // Navigate based on type
    if (item.type === 'mention' && item.airdropId) {
      try {
        const airdropRef = doc(db, 'airdrops', item.airdropId);
        const airdropSnap = await getDoc(airdropRef);
        
        if (airdropSnap.exists()) {
          navigation.navigate('AirdropDetail', { item: { id: airdropSnap.id, ...airdropSnap.data() } });
        } else {
          // Fallback if airdrop was deleted
          navigation.navigate('AirdropDetail', { item: { id: item.airdropId, title: item.airdropTitle, status: 'finished' } });
        }
      } catch (error) {
        console.log("Error fetching airdrop:", error);
      }
    }
  };

  const handleDeleteNotification = async (notificationId) => {
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
    } catch (error) {
      console.log('Error deleting notification:', error);
    }
  };

  const renderItem = ({ item }) => {
    const renderRightActions = (progress, dragX) => {
      const scale = dragX.interpolate({
        inputRange: [-100, 0],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      });
      return (
        <TouchableOpacity
          style={styles.deleteSwipeButton}
          onPress={() => handleDeleteNotification(item.id)}
        >
          <Animated.Text style={[styles.deleteSwipeText, { transform: [{ scale }] }]}>
            Sil
          </Animated.Text>
        </TouchableOpacity>
      );
    };

    return (
      <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
        <TouchableOpacity 
          style={[styles.notificationItem, { backgroundColor: item.read ? theme.background : theme.card, borderBottomColor: theme.border }]} 
          onPress={() => handlePressNotification(item)}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="at-circle" size={32} color={theme.primary} />
          </View>
          <View style={styles.contentContainer}>
            <Text style={[styles.title, { color: theme.text }]}>
              <Text style={{ fontWeight: 'bold' }}>{item.senderName}</Text> senden bahsetti:
            </Text>
            <Text style={[styles.message, { color: theme.textSecondary }]} numberOfLines={2}>
              "{item.text}"
            </Text>
            <Text style={[styles.date, { color: theme.textSecondary }]}>
              {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('tr-TR') : ''}
            </Text>
          </View>
          {!item.read && <View style={styles.unreadDot} />}
        </TouchableOpacity>
      </Swipeable>
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
      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={60} color={theme.border} />
            <Text style={{ color: theme.textSecondary, marginTop: 10 }}>Henüz bildiriminiz yok.</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  notificationItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: 16,
  },
  contentContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    marginBottom: 6,
    fontStyle: 'italic',
  },
  date: {
    fontSize: 11,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    marginLeft: 10,
  },
  deleteSwipeButton: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  deleteSwipeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  }
});

export default NotificationsScreen;
