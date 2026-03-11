import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, SegmentedControlIOS, Platform } from 'react-native';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

const TicketListScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open'); // 'open' or 'closed'

  useEffect(() => {
    const q = query(
      collection(db, 'tickets'),
      where('status', '==', filter),
      orderBy('lastUpdated', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTickets = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(ticket => !ticket.deletedForAdmin);
      setTickets(fetchedTickets);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching tickets:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [filter]);

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={[styles.ticketItem, { backgroundColor: theme.card, borderBottomColor: theme.border }]} 
      onPress={() => navigation.navigate('TicketDetail', { ticketId: item.id, ticketTitle: item.title })}
    >
      <View style={styles.ticketInfo}>
        <View style={styles.row}>
          <Text style={[styles.ticketTitle, { color: theme.text }]}>{item.title}</Text>
          {item.unreadBy === 'admin' && <View style={styles.unreadDot} />}
        </View>
        <Text style={[styles.creator, { color: theme.textSecondary }]}>Oluşturan: {item.creatorName}</Text>
        <Text style={[styles.lastMsg, { color: theme.textSecondary }]} numberOfLines={1}>
          {item.lastMessage}
        </Text>
      </View>
      <View style={styles.meta}>
        <Text style={[styles.date, { color: theme.textSecondary }]}>
          {item.lastUpdated?.toDate ? item.lastUpdated.toDate().toLocaleDateString('tr-TR') : ''}
        </Text>
        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.filterContainer}>
        {['open', 'closed'].map((f) => (
          <TouchableOpacity 
            key={f}
            style={[
              styles.filterBtn, 
              { borderColor: theme.border }, 
              filter === f && { backgroundColor: theme.primary, borderColor: theme.primary }
            ]}
            onPress={() => { setLoading(true); setFilter(f); }}
          >
            <Text style={[styles.filterText, { color: filter === f ? '#fff' : theme.textSecondary }]}>
              {f === 'open' ? 'Açık Biletler' : 'Kapatılanlar'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="documents-outline" size={60} color={theme.border} />
              <Text style={{ color: theme.textSecondary, marginTop: 10 }}>
                {filter === 'open' ? 'Şu an açık destek talebi yok.' : 'Kapatılmış bilet bulunmuyor.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterContainer: {
    flexDirection: 'row',
    padding: 15,
    gap: 10,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  filterText: { fontWeight: 'bold', fontSize: 13 },
  ticketItem: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  ticketInfo: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  ticketTitle: { fontSize: 16, fontWeight: 'bold' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#007AFF', marginLeft: 8 },
  creator: { fontSize: 12, marginTop: 2 },
  lastMsg: { fontSize: 14, marginTop: 4 },
  meta: { alignItems: 'flex-end' },
  date: { fontSize: 11, marginBottom: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
});

export default TicketListScreen;
