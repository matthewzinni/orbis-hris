-- Allow common browser fallbacks for Word/PDF uploads on candidate resumes.

update storage.buckets
set
  allowed_mime_types = array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream',
    'text/plain'
  ],
  file_size_limit = 15728640
where id = 'candidate-resumes';
