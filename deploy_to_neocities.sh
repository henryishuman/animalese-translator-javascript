API_KEY="API_KEY_HERE"  # Replace with your actual Neocities API key
LOCAL_DIR="."

cd "$LOCAL_DIR" || exit

find . -type f \
  ! -path "*/.git/*" \
  ! -path "README.md" \
  ! -path "output.wav" \
  ! -path "preview.jpg" \
  ! -path "deploy_to_neocities.sh" | while read -r file; do

    remote_path="${file#./}"

    echo "Uploading: $remote_path"

    curl -s -H "Authorization: Bearer ${API_KEY}" \
         -F "$remote_path=@$file" \
         "https://neocities.org/api/upload" | grep "message"

done