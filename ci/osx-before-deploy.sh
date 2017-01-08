# security find-identity

wget -q $MAC_CERT_URL
echo $MAC_CERT_KEY | gpg -d --batch --passphrase-fd 0 -o certificate.zip certificate.zip.gpg
unzip certificate.zip

security create-keychain -p travis osx-build.keychain
security default-keychain -s osx-build.keychain
security unlock-keychain -p travis osx-build.keychain
security set-keychain-settings -t 3600 -l ~/Library/Keychains/osx-build.keychain

security import dev.cer -k ~/Library/Keychains/osx-build.keychain -T /usr/bin/codesign
security import dev.p12 -k ~/Library/Keychains/osx-build.keychain -P "" -T /usr/bin/codesign

export DRIPCAP_DARWIN_SIGN=C0AC25D3DB05BDAF758A4E0A002F25F63F2FC93A

gulp out
gulp darwin
cd .builtapp

codesign --deep --force --verify --verbose --sign "$DRIPCAP_DARWIN_SIGN" ./Dripcap-darwin-x64/dripcap.app/Contents/Frameworks/*
codesign --deep --force --verify --verbose --sign "$DRIPCAP_DARWIN_SIGN" "./Dripcap-darwin-x64/dripcap.app"

cd ..
yarn global add appdmg
appdmg ci/appdmg.json dripcap-darwin-amd64.dmg
