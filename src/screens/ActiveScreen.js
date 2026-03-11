import React, { useState, useEffect } from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { collection, query, onSnapshot } from 'firebase/firestore';
import AirdropCard from '../components/AirdropCard';
import { db } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';

const HomeScreen = () => {
  const { theme } = useTheme();
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState('active'); // 'active' veya 'finished'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    try {
      // "orderBy" kaldırıldı, çünkü "where" ile "orderBy" aynı anda kullanıldığında 
      // Firebase özel bir index arıyor. Gelen veriyi biz kendimiz Javascript ile sıralayacağız.
      const q = query(collection(db, 'airdrops'));
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const airdrops = [];
        querySnapshot.forEach((doc) => {
          airdrops.push({ id: doc.id, ...doc.data() });
        });
        
        // Yeniden eskiye (Tarihe göre) sıralama
        airdrops.sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA;
        });

        setData(airdrops);
        setLoading(false);
        setError(false);
      }, (err) => {
        console.log("Listener Error:", err);
        setErrorMsg(err.message);
        setError(true);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err) {
      console.log("Catch Error:", err);
      setErrorMsg(err.message);
      setError(true);
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <View style={[[styles.container, { backgroundColor: theme.background }], styles.center]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[[styles.container, { backgroundColor: theme.background }], styles.center]}>
        <Text style={styles.errorText}>Veriler yüklenirken hata oluştu:</Text>
        <Text style={{textAlign: 'center', marginTop: 10, color: theme.text}}>{errorMsg}</Text>
      </View>
    );
  }

  const filteredData = data.filter(item => item.status === filter);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.toggleContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <TouchableOpacity 
          style={[styles.toggleButton, filter === 'active' && [styles.activeToggle, { backgroundColor: theme.primary }]]}
          onPress={() => setFilter('active')}
        >
          <Text style={[styles.toggleText, filter === 'active' ? { color: '#fff' } : { color: theme.textSecondary }]}>
            Aktif Airdroplar
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.toggleButton, filter === 'finished' && [styles.activeToggle, { backgroundColor: theme.primary }]]}
          onPress={() => setFilter('finished')}
        >
          <Text style={[styles.toggleText, filter === 'finished' ? { color: '#fff' } : { color: theme.textSecondary }]}>
            Bitmiş Airdroplar
          </Text>
        </TouchableOpacity>
      </View>

      {filteredData.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Henüz {filter === 'active' ? 'aktif' : 'bitmiş'} airdrop bulunmuyor.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <AirdropCard item={item} />}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    padding: 20,
  },
  listContainer: {
    paddingVertical: 16,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
  },
  toggleContainer: {
    flexDirection: 'row',
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeToggle: {
    // Theme context will override background color dynamically
  },
  toggleText: {
    fontWeight: '600',
    fontSize: 14,
  }
});

export default HomeScreen;
