#! /bin/sh
if [ ! -f local/lib/libpng.a ]; then

  if [ ! -f prereq ]; then
    mkdir -p prereq
  fi
  if [ ! -f local/lib ]; then
    mkdir -p local/lib
  fi
  if [ ! -f local/bin ]; then
    mkdir -p local/bin
  fi
  if [ ! -f local/include ]; then
    mkdir -p local/include
  fi

  ROOT=$(pwd)
  cd prereq
  if [ ! -f libpng/.git/config ]; then
    git clone git://github.com/glennrp/libpng.git
  else
    cd libpng; git pull; cd ..
  fi
  cd libpng;mkdir build;cd build
  cmake -DCMAKE_INSTALL_PREFIX=${ROOT}/local ..
  make -j 4
  make install

  cd ${ROOT}
fi
