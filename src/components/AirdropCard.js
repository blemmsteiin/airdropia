import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';

const AirdropCard = ({ item, isDiscount = false }) => {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const currentUser = auth.currentUser;
  
  const likes = item.likes || [];
  const dislikes = item.dislikes || [];
  const hasLiked = currentUser ? likes.includes(currentUser.uid) : false;
  const hasDisliked = currentUser ? dislikes.includes(currentUser.uid) : false;

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

  const handleLike = async () => {
    if (!currentUser) return;
    const collectionName = isDiscount ? 'discounts' : 'airdrops';
    const ref = doc(db, collectionName, item.id);
    try {
      if (hasLiked) {
        await updateDoc(ref, { likes: arrayRemove(currentUser.uid) });
      } else {
        await updateDoc(ref, { 
          likes: arrayUnion(currentUser.uid),
          dislikes: arrayRemove(currentUser.uid)
        });
      }
    } catch (error) {
      console.log('Like error:', error);
    }
  };

  const handleDislike = async () => {
    if (!currentUser) return;
    const collectionName = isDiscount ? 'discounts' : 'airdrops';
    const ref = doc(db, collectionName, item.id);
    try {
      if (hasDisliked) {
        await updateDoc(ref, { dislikes: arrayRemove(currentUser.uid) });
      } else {
        await updateDoc(ref, { 
          dislikes: arrayUnion(currentUser.uid),
          likes: arrayRemove(currentUser.uid)
        });
      }
    } catch (error) {
      console.log('Dislike error:', error);
    }
  };

  return (
    <TouchableOpacity 
      activeOpacity={0.8}
      onPress={() => navigation.navigate('AirdropDetail', { item, isDiscount })}
    >
      <View style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.text }]}>
        <View style={styles.cardContent}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: theme.text, flexShrink: 1 }]} numberOfLines={2}>{item.title}</Text>
            {isDiscount && (
              <>
                {item.discountPercentage ? (
                  <View style={[styles.discountBadge, { backgroundColor: '#007AFF' }]}>
                    <Text style={styles.discountBadgeText}>{item.discountPercentage}</Text>
                  </View>
                ) : item.profitAmount ? (
                  <View style={[styles.discountBadge, { backgroundColor: '#34C759' }]}>
                    <Text style={styles.discountBadgeText}>{item.profitAmount}</Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
          {item.reward ? (
            <Text style={{ color: '#34C759', fontWeight: '600', fontSize: 14, marginBottom: 4 }}>🏆 Ödül: {item.reward}</Text>
          ) : null}
          
          <View style={styles.footer}>
            <Text style={[styles.date, { color: theme.textSecondary }]}>Son Katılım: {item.endDate}</Text>
            <TouchableOpacity 
              style={[styles.button, item.status === 'finished' && styles.buttonDisabled]}
              onPress={handleJoin}
              disabled={item.status === 'finished'}
            >
              <Text style={styles.buttonText}>
                {item.status === 'active' 
                  ? (isDiscount ? 'İndirimi Kap!' : 'Katıl') 
                  : 'Süresi Doldu'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Like / Dislike */}
          <View style={styles.likeRow}>
            <TouchableOpacity style={styles.likeBtn} onPress={handleLike}>
              <Text style={{ fontSize: 18 }}>{hasLiked ? '👍' : '👍🏻'}</Text>
              <Text style={[styles.likeCount, { color: hasLiked ? '#007AFF' : theme.textSecondary }]}>{likes.length}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.likeBtn} onPress={handleDislike}>
              <Text style={{ fontSize: 18 }}>{hasDisliked ? '👎' : '👎🏻'}</Text>
              <Text style={[styles.likeCount, { color: hasDisliked ? '#FF3B30' : theme.textSecondary }]}>{dislikes.length}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginVertical: 8,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  cardContent: {
    padding: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    marginBottom: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  discountBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  discountBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 12,
    color: '#999',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  likeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 16,
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  likeCount: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default AirdropCard;
