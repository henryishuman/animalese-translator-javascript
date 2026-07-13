API_KEY="API_KEY_HERE"  # Replace with your actual Neocities API key
LOCAL_DIR="."

cd "$LOCAL_DIR" || exit

find . -type f \
  ! -path "*/.git/*" \
  ! -name "README.md" \
  ! -name "output.wav" \
  ! -name "preview.jpg" \
  ! -name "deploy_to_neocities.sh" | while read -r file; do

    remote_path="${file#./}"

    echo "Uploading: $remote_path"

    curl -s -H "Authorization: Bearer ${API_KEY}" \
         -F "$remote_path=@$file" \
         "https://neocities.org/api/upload" | grep "message"

done