#! /bin/sh 
# http://download.qt.io/official_releases/qt/4.8/4.8.7/
curl -L -o qt-everywhere.tgz http://download.qt.io/official_releases/qt/4.8/4.8.7/qt-everywhere-opensource-src-4.8.7.tar.gz
gunzip qt-everywhere.tgz
tar -xvf qt-everywhere.tar
cd qt-everywhere
patch < el-capitan.patch
./configure -prefix /Users/dp/local -opensource -shared -no-multimedia -stl -no-phonon -silent -no-framework -arch x86_64  
make -j 4; make install
install_name_tool -id /Users/dp/local/lib/libshiboken-python2.7.1.2.dylib /Users/dp/local/lib/libshiboken-python2.7.1.2.dylib
cd ..

# now, must copy qmake into $PATH accessible location
# or can qmake be pointed at with the following?
# export QMAKE=/Users/myHomeDir/qt-4.7.1/bin/qmake


curl -L -o shiboken.tgz http://download.qt.io/official_releases/pyside/shiboken-1.2.2.tar.bz2
gunzip shiboken.tgz
tar -xvf shiboken.tar
cd shiboken-1.2.2
mkdir build; cd build
cmake -DCMAKE_INSTALL_PREFIX=${HOME}/local -DALTERNATIVE_QT_INCLUDE_DIR=${HOME}/local ..
make -j 4; make install
cd ../..

curl -L -o pyside-qt.tgz http://download.qt.io/official_releases/pyside/pyside-qt4.8+1.2.2.tar.bz2
gunzip pyside-qt.tgz
tar -xvf pyside-qt.tar
cd pyside-qt4.8+1.2.2

# patch this in as second line of CMakeLists.txt
# include_directories(AFTER SYSTEM ${HOME}/local/include)

# also hack this chunk
#     if(CMAKE_HOST_APPLE)
    #    if (NOT QT_INCLUDE_DIR)
    #        set(QT_INCLUDE_DIR "/Library/Frameworks")
    #    endif()
   #     if(ALTERNATIVE_QT_INCLUDE_DIR)
  #          set(QT_INCLUDE_DIR ${ALTERNATIVE_QT_INCLUDE_DIR})
  #      endif()
  #      set(QT_INCLUDE_DIR "/Users/dp/local/include")
  #      string(REPLACE " " ":" QT_INCLUDE_DIR ${QT_INCLUDE_DIR})
 #   endif()
 #

mkdir build; cd build
cmake -DCMAKE_INSTALL_PREFIX=${HOME}/local -DALTERNATIVE_QT_INCLUDE_DIR=${HOME}/local -DBUILD_TESTS=False -DENABLE_ICECC=0 ..
make -j 4; make install
install_name_tool -id /Users/dp/local/lib/libpyside-python2.7.1.2.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.2.dylib
install_name_tool -change libpyside-python2.7.1.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.dylib /Users/dp/local/lib/python2.7/site-packages/PySide/QtCore.so
install_name_tool -change libpyside-python2.7.1.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.dylib /Users/dp/local/lib/python2.7/site-packages/PySide/QtSql.so
install_name_tool -change libpyside-python2.7.1.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.dylib /Users/dp/local/lib/python2.7/site-packages/PySide/QtDeclarative.so 
install_name_tool -change libpyside-python2.7.1.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.dylib /Users/dp/local/lib/python2.7/site-packages/PySide/QtSvg.so
install_name_tool -change libpyside-python2.7.1.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.dylib /Users/dp/local/lib/python2.7/site-packages/PySide/QtGui.so 
install_name_tool -change libpyside-python2.7.1.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.dylib /Users/dp/local/lib/python2.7/site-packages/PySide/QtTest.so
install_name_tool -change libpyside-python2.7.1.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.dylib /Users/dp/local/lib/python2.7/site-packages/PySide/QtHelp.so        
install_name_tool -change libpyside-python2.7.1.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.dylib /Users/dp/local/lib/python2.7/site-packages/PySide/QtUiTools.so
install_name_tool -change libpyside-python2.7.1.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.dylib /Users/dp/local/lib/python2.7/site-packages/PySide/QtNetwork.so     
install_name_tool -change libpyside-python2.7.1.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.dylib /Users/dp/local/lib/python2.7/site-packages/PySide/QtWebKit.so
install_name_tool -change libpyside-python2.7.1.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.dylib /Users/dp/local/lib/python2.7/site-packages/PySide/QtOpenGL.so      
install_name_tool -change libpyside-python2.7.1.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.dylib /Users/dp/local/lib/python2.7/site-packages/PySide/QtXml.so
install_name_tool -change libpyside-python2.7.1.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.dylib /Users/dp/local/lib/python2.7/site-packages/PySide/QtScript.so      
install_name_tool -change libpyside-python2.7.1.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.dylib /Users/dp/local/lib/python2.7/site-packages/PySide/QtXmlPatterns.so
install_name_tool -change libpyside-python2.7.1.2.dylib /Users/dp/local/lib/libpyside-python2.7.1.2.dylib /Users/dp/local/lib/python2.7/site-packages/PySide/QtScriptTools.so


# need to patch everything in ~/local/lib/python2.7/site-packages/pyside
# to rpath to ~/local/lib so that that libraries can be imported
cd ../..

curl -L -o pyside-tools.tgz https://github.com/PySide/Tools/archive/0.2.15.tar.gz
gunzip pyside-tools.tgz
tar -xvf pyside-tools.tar
cd Tools-0.2.15
mkdir build; cd build
cmake -DCMAKE_INSTALL_PREFIX=${HOME}/local -DALTERNATIVE_QT_INCLUDE_DIR=${HOME}/local ..
make -j 4; make install
cd ../..
