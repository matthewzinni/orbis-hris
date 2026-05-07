import os
import re
import csv
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.python')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError('Missing Supabase environment variables.')

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

BUCKET = 'employee-documents'
STAFF_FOLDER = Path.home() / 'Desktop' / 'Work' / 'Staff'
MANUAL_FOLDER_MAP = {
    'Aguilar Castro, Roman': 'BTW2505',
    'Castro Vazquez, Gisselle': 'BTW2201',
    'Finscel, Vada': 'BTW2603',
    'Guiterrez, Jed': 'BTW2611',
    'Hunsinger, Matt': 'BTW2604',
    'Leggett, Matthew': 'BTW2001',
    'Liverman, Serina (Brooke)': 'BTW2523',
    'McLean, James (Dean)': 'BTW1701',
    'Montgomery, Samuel': 'BTW2514',
    'Quintero, Trinden': 'BTW2513',
    'Zenil, Dori': 'BTW2507',
}


def normalize_name(value):
    value = str(value or '').lower().strip()
    value = re.sub(r'\([^)]*\)', '', value)
    value = re.sub(r'[^a-z0-9, ]+', '', value)
    value = re.sub(r'\s+', ' ', value).strip()
    return value


def folder_name_to_key(folder_name):
    cleaned = normalize_name(folder_name)

    if ',' not in cleaned:
        return cleaned

    last, first = [part.strip() for part in cleaned.split(',', 1)]
    return f'{last}, {first}'


def safe_storage_filename(filename):
    path = Path(filename)
    stem = path.stem
    suffix = path.suffix.lower()

    safe_stem = re.sub(r'[^A-Za-z0-9_-]+', '_', stem)
    safe_stem = re.sub(r'_+', '_', safe_stem).strip('_')

    if not safe_stem:
        safe_stem = 'document'

    return f'{safe_stem}{suffix}'


def employee_to_keys(employee):
    employee_id = employee.get('employee_id') or employee.get('id')
    first = normalize_name(employee.get('first_name') or employee.get('first') or '')
    last = normalize_name(employee.get('last_name') or employee.get('last') or '')

    keys = set()

    if first and last:
        keys.add(f'{last}, {first}')
        keys.add(f'{first} {last}')

    if employee.get('name'):
        keys.add(normalize_name(employee.get('name')))

    return employee_id, keys


def load_employee_lookup():
    response = supabase.table('employees').select('*').execute()
    employees = response.data or []
    lookup = {}

    for employee in employees:
        employee_id, keys = employee_to_keys(employee)

        if not employee_id:
            continue

        for key in keys:
            lookup[key] = employee_id

    return lookup


# Export employee lookup for debugging
def export_employee_lookup_debug():
    response = supabase.table('employees').select('*').execute()
    employees = response.data or []

    with open('employee_lookup.csv', 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(['employee_id', 'first_name', 'last_name', 'name', 'generated_keys'])

        for employee in employees:
            employee_id, keys = employee_to_keys(employee)
            writer.writerow([
                employee_id,
                employee.get('first_name') or employee.get('first') or '',
                employee.get('last_name') or employee.get('last') or '',
                employee.get('name') or '',
                ' | '.join(sorted(keys))
            ])


def document_record_exists(employee_id, storage_path):
    response = supabase.table('employee_documents') \
        .select('id') \
        .eq('employee_id', employee_id) \
        .eq('file_path', storage_path) \
        .limit(1) \
        .execute()

    return bool(response.data)


def upload_employee_folder(employee_id, folder_path):
    uploaded_count = 0

    for file_path in folder_path.iterdir():
        if not file_path.is_file():
            continue

        if file_path.name.startswith('.'):
            continue

        safe_file_name = safe_storage_filename(file_path.name)
        storage_path = f'{employee_id}/{safe_file_name}'
        file_ext = file_path.suffix.replace('.', '').lower()

        print(f'Uploading {file_path.name} -> {storage_path}')

        with open(file_path, 'rb') as file:
            supabase.storage.from_(BUCKET).upload(
                storage_path,
                file,
                {'upsert': 'true'}
            )

        if document_record_exists(employee_id, storage_path):
            print(f'Database record already exists, skipped insert: {file_path.name}')
        else:
            supabase.table('employee_documents').insert({
                'employee_id': employee_id,
                'document_type': 'other',
                'file_name': file_path.name,
                'file_path': storage_path,
                'file_ext': file_ext
            }).execute()

            print(f'Inserted database record: {file_path.name}')

        uploaded_count += 1

    return uploaded_count


def main():
    print(f'Scanning staff folder: {STAFF_FOLDER}')

    if not STAFF_FOLDER.exists():
        raise FileNotFoundError(f'Staff folder not found: {STAFF_FOLDER}')

    employee_lookup = load_employee_lookup()
    export_employee_lookup_debug()

    print(f'Loaded {len(employee_lookup)} employee name lookup keys from Supabase.')

    processed = 0
    uploaded = 0
    unmatched = []

    for folder in sorted(STAFF_FOLDER.iterdir()):
        if not folder.is_dir():
            continue

        folder_key = folder_name_to_key(folder.name)
        employee_id = MANUAL_FOLDER_MAP.get(folder.name)

        if not employee_id:
            employee_id = employee_lookup.get(folder_key)

        if not employee_id:
            unmatched.append(folder.name)
            print(f'Skipping unmatched folder: {folder.name}')
            continue

        print(f'Processing {folder.name} -> {employee_id}')
        uploaded += upload_employee_folder(employee_id, folder)
        processed += 1

    print('')
    print('Upload complete.')
    print(f'Processed employee folders: {processed}')
    print(f'Uploaded files checked: {uploaded}')
    print(f'Unmatched folders: {len(unmatched)}')

    if unmatched:
        print('')
        print('Unmatched folder names:')
        for folder_name in unmatched:
            print(f'- {folder_name}')

        with open('unmatched_folders.csv', 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(['folder_name'])
            for folder_name in unmatched:
                writer.writerow([folder_name])

        print('')
        print('Saved employee_lookup.csv and unmatched_folders.csv for matching review.')


if __name__ == '__main__':
    main()