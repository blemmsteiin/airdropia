import React, { useState, useEffect } from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { collection, query, onSnapshot } from 'firebase/firestore';
import AirdropCard from '../components/AirdropCard';
import { db } from '../config/firebase';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DiscountsScreen = ({ navigation }) => {
  const { theme } = useTheme();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const adminCache = await AsyncStorage.getItem('isAdmin_cache');
      setIsAdmin(adminCache === 'true');
    };
    checkAdmin();
  }, []);

  useEffect(() => {
    try {
      const q = query(collection(db, 'discounts'));
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const discountsData = [];
        querySnapshot.forEach((doc) => {
          discountsData.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort newest first
        discountsData.sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA;
        });

        setData(discountsData);
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {data.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Henüz eklenmiş bir indirim veya kampanya bulunmuyor.
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item.id}
          // We can reuse the AirdropCard component since the data structure is similar
          renderItem={({ item }) => <AirdropCard item={item} isDiscount={true} />}
          contentContainerStyle={styles.listContainer}
        />
      )}
      {isAdmin && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.primary }]}
          onPress={() => navigation.navigate('AdminDashboard', { target: 'discounts' })}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
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
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  }
});

export default DiscountsScreen;
