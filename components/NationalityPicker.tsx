import { View, Text, StyleSheet, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useStore } from '../store/useStore';

const NATIONALITIES = [
  'American', 'Mexican', 'Canadian', 'British', 'Australian',
  'Chinese', 'Japanese', 'Korean', 'Indian', 'French',
  'German', 'Spanish', 'Italian', 'Brazilian', 'Russian',
  'Saudi Arabian', 'Egyptian', 'Nigerian', 'South African',
  'Argentinian', 'Colombian', 'Vietnamese', 'Thai', 'Filipino',
  'Turkish', 'Polish', 'Ukrainian', 'Indonesian', 'Malaysian',
  'Pakistani', 'Bangladeshi', 'Iranian', 'Iraqi', 'Other',
];

export function NationalityPicker() {
  const user = useStore((state) => state.user);
  const [selectedNationality, setSelectedNationality] = useState(user?.nationality || 'American');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user?.nationality) {
      setSelectedNationality(user.nationality);
    }
  }, [user?.nationality]);

  const saveNationality = async (newNationality: string) => {
    if (!user) return;

    setIsSaving(true);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        nationality: newNationality,
      });

      // Update local store
      useStore.setState({
        user: {
          ...user,
          nationality: newNationality,
        },
      });

      console.log('✅ Nationality saved:', newNationality);
    } catch (error) {
      console.error('❌ Error saving nationality:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNationalityChange = (nationality: string) => {
    setSelectedNationality(nationality);
    saveNationality(nationality);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Nationality</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={selectedNationality}
          onValueChange={handleNationalityChange}
          enabled={!isSaving}
          style={styles.picker}
        >
          {NATIONALITIES.map((nationality) => (
            <Picker.Item
              key={nationality}
              label={nationality}
              value={nationality}
            />
          ))}
        </Picker>
      </View>
      <Text style={styles.helpText}>
        Used by AI to provide culturally relevant context and translations
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#000',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  picker: {
    height: Platform.OS === 'ios' ? 180 : 50,
    ...Platform.select({
      android: {
        color: '#000',
      },
    }),
  },
  helpText: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
    lineHeight: 18,
  },
});
